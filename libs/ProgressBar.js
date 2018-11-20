import parseRatio from './parse-ratio';
import parseBytes from './parse-bytes';
const {merge} = require('lodash');
import {format} from 'util';
import chalk from 'chalk';
import progressStream from 'progress-stream';

var _globOpts = {
  template: '',
  colorize: true,
  clean: false,
  bar: {
    filler: '#',
    blank: '-',
    separator: '',
    color: ['black', 'bgGreen'],
  },
  flipper: '|/-\\',
  get length() {
    return Math.floor(process.stdout.columns / 2 - 20);
  },
  _template: {},
};

var _defaultOptions = merge({}, _globOpts, {
  template: '[%{bar%}] %{flipper%} %{label%} %{percentage%}% [%{completed%}/%{total%}]',
});

var _streamOpts = merge({}, _globOpts, {
  template:
    '%{label%}: |%{bar%}| %{slot:percentage%}% %{flipper%} %{slot:size%}/%{slot:size:total%} %{slot:eta%}s [%{percentage%}% @ %{eta%}s %{size%}/%{size:total%}]',
  progress: {},
});

/**
 * Parse a template, replace parts with specified values
 * @param {String} template Template to be parsed
 * @param {*} features Object containing the object parts with replaceable values
 */
function parseTemplate(template, features) {
  for (let spec in features) {
    var regex = new RegExp(`%{${spec}%}`, 'g');
    var replacement = features[spec];
    template = template.replace(
      regex,
      regex.test(replacement) && !replacement.includes(`%{${spec}%}`) ? parseTemplate(replacement, features) : replacement
    );
  }
  return template;
}

/**
 * Get a current flipper
 * @param {Number} count Value that determines the flipper
 * @param {String|String[]} flippers String or (Array of strigs) of flippers
 */
var flipper = (function() {
  function flipper(count, flippers) {
    function manageInt(max, val) {
      if (val > max) return manageInt(max, val - max);
      return val;
    }
    return flippers[manageInt(flippers.length, count) - 1];
  }
  flipper.count = 0;
  return flipper;
})();

/**
 * Prepare the bar to be drawn
 * @param {Number} filled Number of iterations at which to repeat the filler
 * @param {Number} empty Number of iterations at which to repeat the blank filler
 * @param {*} opts Hot bar options
 */
function getBar(filled, empty, opts) {
  var barOpts = merge({}, _defaultOptions.bar, opts.bar);
  var {filler, blank} = barOpts,
    color = merge([], barOpts.color, opts.bar.color);
  [filled, empty] = [filled, empty].map(v => Math.floor(v));
  [filler, blank] = [filler, blank].map(content => (Array.isArray(content) || typeof content === 'string' ? content : ''));
  var colorize = opts.colorize ? color.reduce((chalk, color) => chalk[color], chalk) : str => str;
  return colorize(filler.repeat(filled)).concat(blank.repeat(empty));
}

class ProgressBar {
  /**
   * Build a progress bar
   * @param {Number} total Total attainable value of bytes in <N>
   * @param {Number[]} arr Allocation of slots in <%>
   * @param {_globOpts} opts Attachable options
   */
  constructor(total = 100, arr = [100], opts) {
    this.total = total;
    this.opts = merge({}, _defaultOptions, opts);
    this.cores = {label: 'Loading', _attach: {append: []}};
    this.slots = parseRatio(arr, 100).map(level => ({level, value: 0}));
    this.styler = getBar;
  }
  /**
   * Label the progressbar while returning itself
   * @param {String} label The string label
   */
  label(label) {
    return label ? ((this.cores.label = label), this) : this.cores.label;
  }
  /**
   * Update the progressbar with certain percentages and draw
   * - Alternative to `this.update(levels).draw(template)`
   * @param {Number|Number[]} levels Level(s) to update slots with
   * @param {*} template Template to use on the drawn progress bar
   */
  tick(levels, template) {
    return this.update(levels).draw(template);
  }
  /**
   * Update the progressbar slots with certain percentages
   * - This will top up the current slots with the inputed values as opposed to `this.progress(levels)`
   * @param {Number|Number[]} levels Level(s) to update the slots with
   */
  update(levels = this.slots.map(slot => slot.value)) {
    levels =
      typeof levels === 'number'
        ? Array(this.slots.length).fill(levels)
        : Array.isArray(levels)
          ? levels
          : this.current.map(v => v.value || 0);
    let res;
    return this.progress(this.slots.map((slot, index) => ((res = slot.value + (levels[index] | 0)), res > 100 ? 100 : res)));
  }
  /**
   * Update the progressbar slots to specified percentages
   * @param {Number|Number[]} levels Level(s) to update the slots to
   */
  progress(levels) {
    [this, ...this.cores._attach.append.filter(block => block.inherit).map(block => block.bar)].map(bar => {
      levels = levels || bar.slots.map(slot => slot.value);
      levels =
        typeof levels === 'number'
          ? Array(bar.slots.length).fill(levels)
          : Array.isArray(levels)
            ? levels
            : bar.slots.map(v => v.value);
      var invalids = levels.reduce((obj, value, index) => (value > 100 && obj.push({value, index}), obj), []);
      if (invalids.length) {
        throw Error(
          `Percentage value in <levels>[${invalids.map(v => v.index).join()}]:[${invalids
            .map(v => v.value)
            .join()}] is greater than 100`
        );
      }
      bar.slots = bar.slots.map((slot, index) => ((slot.value = levels[index] || slot.value), slot));
    });
    return this;
  }
  /**
   * Get an average round up of values in percentage and current progress compatred to the total
   * @param {Number} fixedPoint The fixed point at which to approximate average values to
   */
  average(fixedPoint = undefined) {
    var percentage = this.slots.map(v => v.value).reduce((a, b) => a + b, 0) / (this.slots.length || 1);
    var value = (percentage / 100) * this.total;
    if (fixedPoint || fixedPoint == 0)
      [percentage, value] = [percentage, value].map(value => parseFloat(value.toFixed(fixedPoint)));
    return {percentage, value, remaining: this.total - value};
  }
  /**
   * Draw the progressbar, apply template options to the template
   * @param {*} template The template to use on the drawn progress bar
   */
  draw(template) {
    var result = [
      this.constructBar(template),
      ...this.cores._attach.append.map(block => block.bar.constructBar(block.inherit ? template : null)),
    ];
    this.print(`bar${result.length > 1 ? `+${result.length - 1}` : ''}`, result.join('\n'));
    this.hasBarredOnce = true;
    return this;
  }
  /**
   * Draw the progressbar, apply template options to the template
   * @param {*} template The template to use on the drawn progress bar
   */
  constructBar(template) {
    let bar = this,
      bars = this.slots.map(({level, value}) => {
        let fillable = Math.floor((level / 100) * bar.opts.length);
        let filled = Math.floor((value / 100) * fillable);
        let empty = fillable - filled;
        return this.styler(filled, empty, this.opts);
      }),
      _template = {
        bar: bars.join(this.opts.bar.separator || ''),
        flipper: flipper(++flipper.count, this.opts.flipper),
        label: this.label(),
        percentage: this.average(2).percentage,
        get ['percentage:invert']() {
          return Math.floor(100 - this.percentage);
        },
        completed: this.average(2).value,
        total: this.total,
      };
    return parseTemplate(bar.opts.template, merge({}, bar.opts._template || {}, _template, template));
  }
  /**
   * Print a message after a bar `draw` interrupt
   * @param {'bar'|'end'} type Type of bar print or the first part of the printer
   * @param {any[]} content The contents to be formatted
   */
  print(type, ...content) {
    type = format(type);
    // If bar has ended throw error
    function cleanWrite(arr, justLogged, addons = 0) {
      if (!justLogged) {
        process.stdout.moveCursor(0, -addons);
        process.stdout.cursorTo(0);
        process.stdout.clearScreenDown();
      }
      process.stdout.write(`${justLogged ? '\n' : ''}${format(...arr)}`);
    }
    var addonPack,
      addons = this.hasBarredOnce && !this.justLogged ? this.cores._attach.append.length : 0;
    this.justLogged =
      type === 'bar' && content.length === 1
        ? !!cleanWrite(content, this.justLogged, addons)
        : (addonPack = type.match(/bar\+(\d)/)) !== null
          ? !!cleanWrite(content, this.justLogged, this.hasBarredOnce ? addonPack[1] : addons)
          : type === 'end'
            ? !!cleanWrite(content, !this.opts.clean, addons)
            : !cleanWrite([(type.startsWith(':') && `${type.slice(1)}`) || type, ...content], this.justLogged, addons);
    return this;
  }
  /**
   * End the bar irrespective of progress
   * @param {String} message The content to be written to `stdout` after to ending the bar
   */
  end(...message) {
    if (message.length) this.print('end', ...message);
    this.isEnded = true;
    return this;
  }
  /**
   * Drain all slots in the progressbar to 0
   */
  drain() {
    this.slots = this.slots.map(slot => ((slot.value = 0), slot));
    return this;
  }
  /**
   * Drop the chain, return void
   */
  drop() {}
  /**
   * Check if the bar or a slot is complete
   * @param {Number} slot The slot to be checked for completion
   * @param {*} fixedPoint Fixed point approximation
   */
  isComplete(slot = undefined, fixedPoint = 100) {
    if (slot && !this.slots[slot]) throw Error(`Value in <slot>:${slot} has no slot reference`);
    return slot ? this.slots[slot].value === 100 : this.average(fixedPoint).percentage === 100;
  }
  /**
   * Append the specified bar after `this`
   * - Alias for `this.attach(bar, 'append', inherit);`
   * @param {ProgressBar} bar The bar to be appended
   * @param {Boolean} inherit Whether or not to inherit bar templates from `this`
   */
  append(bar, inherit = false) {
    if (!ProgressBar.isBar(bar) && !bar.opts.template) throw Error('The Parameter <bar> is not a progressbar or a hanger');
    this.cores._attach.append.push({bar, inherit});
    bar.cores._attach.parent = this;
    return this;
  }
  /**
   * Get the parent the progressbar is attached to
   * - returns `this` in the absence of a parent
   * @returns {ProgressBar|this} Parent bar
   */
  parent() {
    return this.cores._attach.parent || this;
  }
  /**
   * Find out the progressbar is appended to another
   */
  get isChild() {
    return !!this.cores._attach.parent;
  }
  /**
   * Check if the progressbar is active.
   * - Activity is determined when the progressbar is not complete
   */
  get isActive() {
    return !this.isComplete();
  }
  /**
   * Check if the bar is fresh.
   * - Equivalent of `this.isActive && !this.average().value`
   */
  get isFresh() {
    return this.isActive && !this.average().value;
  }
  /**
   * Create a streamified bar for use with generators
   * @param {Number} total Total attainable value of bytes in <N>
   * @param {Number|Number[]} slots Number of slots in <%>
   * @param {(bar:ProgressBar,slotLevel:Number,template:{}) => void} actor The actor for every yield
   * @param {*} opts Options for the bar
   */
  static stream(total, slots, opts, actor) {
    var progressBar = new this(total, slots);
    return this.streamify(progressBar, actor, opts);
  }
  /**
   * Streamify a bar for use with generators
   * @param {ProgressBar} bar The bar to be used
   * @param {(bar:ProgressBar,slotLevel:Number,template:{}) => void} actor The actor for every yield
   * @param {*} opts Options for the bar
   * @returns {{next(total: Number, opts: {}):NodeJS.WritableStream, bar:ProgressBar}} Returned function from `ProgressBar.streamify`
   */
  static streamify(bar, actor, opts) {
    bar.opts = merge({}, _streamOpts, bar.opts, opts);
    if (bar.opts.template === _defaultOptions.template) bar.opts.template = merge({}, _streamOpts, opts).template;
    var streamGenerator = this.rawStreamify(bar, (bar, slotLevel, total = bar.total) => {
      if (!ProgressBar.isBar(bar)) throw Error('The Parameter is not a progressBar');
      var through = progressStream(merge({}, {time: 100, length: total}, bar.opts.progress));
      ((through.bar = bar), through)
        .on('progress', progress => {
          if (bar.isEnded) return;
          through.emit('tick', bar);
          var _template = merge(
            {},
            {
              'slot:bar': (value => {
                let fillable = Math.floor(bar.opts.length);
                let filled = Math.floor((value / 100) * fillable);
                let empty = fillable - filled;
                return bar.styler(filled, empty, bar.opts);
              })(progress.percentage),

              'slot:size': parseBytes(progress.transferred, 2, {shorten: true}),
              'slot:size:total': parseBytes(progress.length, 2, {shorten: true}),

              size: parseBytes(bar.average().value, 2, {shorten: true}),
              'size:total': parseBytes(bar.total, 2, {shorten: true}),

              'slot:percentage': progress.percentage.toFixed(0),
              percentage: bar.average(0).percentage,

              'slot:eta': progress.eta,
              eta: Math.round(bar.average().remaining / progress.speed),
            },
            bar.opts._template
          );
          var level = bar.slots.map((...[, index]) => ++index === slotLevel && progress.percentage);
          (actor || ((bar, level, _template) => bar.progress(level).draw(_template))).call(null, bar, level, _template);
        })
        .once('error', () => bar.end())
        .once('finish', () => through.emit('complete', bar));
      return through;
    });
    return {
      /**
       * Get the next PassThrough instance
       * @param {total: Number, opts: {}} opts The options to be used
       * @returns {NodeJS.WritableStream} Returned function from `ProgressBar.streamify`
       */
      next: (...opts) => streamGenerator.next(opts).value,
      /**
       * The ProgressBar Instance
       * @type {ProgressBar} The ProgresBar
       */
      bar: streamGenerator.next().value,
    };
  }
  /**
   * Prepare a raw generator for use
   * @param {ProgressBar} bar The bar to be used
   * @param {(bar:ProgressBar, slots:Number, total?:Number) => String} actor The performing function
   * @returns {Generator} New ProgressBar Generator
   * @yields The through instance or a cache model of the ProgressBar
   */
  static *rawStreamify(bar, actor) {
    var args;
    for (let level = 0; level <= bar.slots.length; level++)
      args = !level ? yield bar : yield actor(((bar.opts = merge({}, _streamOpts, bar.opts, args[1])), bar), level, args[0]);
  }
  /**
   * Check if the provided progressbar is an instance of `this`
   * @param {ProgressBar} bar The progressbar to be checked
   */
  static isBar(bar) {
    return bar instanceof this;
  }
}

export default ProgressBar;
