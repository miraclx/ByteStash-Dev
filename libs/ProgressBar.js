/**
 * @copyright (c) 2017 Miraculous Owonubi
 * @author Miraculous Owonubi
 * @license Apache-2.0
 * @module bar-progress
 */

let { format } = require('util'),
  chalk = require('chalk'),
  EventEmitter = require('events'),
  { merge } = require('lodash'),
  progressStream = require('progress-stream'),
  parseRatio = require('./parse-ratio'),
  parseBytes = require('./parse-bytes'),
  parseTemplate = require('./parse-template');

let _globOpts = {
  bar: {
    filler: '#',
    header: '',
    blank: '-',
    separator: '',
    colorize: true,
    pulsateSkip: 15,
    pulsateLength: 15,
    color: ['black', 'bgGreen'],
  },
  clean: false,
  template: '',
  _template: {},
  pulsate: false,
  forceFirst: false,
  flipper: ['|', '/', '-', '\\'],
  length() {
    return Math.floor(process.stdout.columns / 2 - 20);
  },
};

let _defaultOptions = {
  ..._globOpts,
  template: '[%{bar%}] %{flipper%} %{label%} %{percentage%}% [%{completed%}/%{total%}]',
};

let _streamOpts = {
  ..._globOpts,
  forceFirst: true,
  template: [
    '%{label%}|%{slot:bar%}| %{_percentage%}% %{_eta%}s [%{slot:size%}/%{slot:size:total%}]',
    'Total:%{bar%} %{percentage%}% %{eta%}s [%{size%}/%{size:total%}]',
  ],
  _template: {
    bar({ bar }) {
      return `${bar ? `   [${bar}]` : ''}`;
    },
    eta({ eta }) {
      return `${eta}`.padStart(3, ' ');
    },
    _eta(feats) {
      return `${feats['slot:eta']}`.padStart(3, ' ');
    },
    label({ label }) {
      return `${label}:`.padEnd(9, ' ');
    },
    percentage({ percentage }) {
      return `${percentage}`.padStart(3, ' ');
    },
    _percentage(feats) {
      return `${feats['slot:percentage']}`.padStart(3, ' ');
    },
  },
  progress: {},
};

/**
 * Get a current flipper
 * @param {Number} count Value that determines the flipper
 * @param {String|String[]} flippers String or (Array of strigs) of flippers
 */
let flipper = (function() {
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
 * @param {_defaultOptions} opts progressBar options
 */
function getBar(filled, empty, opts) {
  let {
    bar: { filler, blank, color, colorize, header },
    pulsate,
  } = opts;
  [filled, empty] = [filled, empty].map(v => Math.floor(v));
  [filler, blank] = [filler, blank].map(content => (Array.isArray(content) || typeof content === 'string' ? content : ''));
  let paint = colorize ? color.reduce((chalk, color) => chalk[color], chalk) : str => str;
  return [paint(filler.repeat(filled)), blank.repeat(empty)].join(!pulsate ? header : '');
}

/**
 * Parse a bar, returning a styled bar with a given percentage filled
 * @param {ProgressBar} bar The bar being parsed
 * @param {Number} fillable Maximum fillable slots
 * @param {Number} percentage Percentage filled
 */
function parseBar(bar, fillable, percentage) {
  fillable = Math.round(fillable);
  let filled = Math.round((Math.floor(percentage) / 100) * fillable);
  return bar.styler(filled, fillable - filled, bar.opts);
}

module.exports = class ProgressBar {
  /**
   * Build a progress bar
   * @param {Number} total Total attainable value of bytes in <N>
   * @param {Number[]} arr Allocation of slots in <%>
   * @param {_defaultOptions} opts Attachable options
   */
  constructor(total = 100, arr = [100], opts = {}) {
    this.total = total;
    this.opts = { ..._defaultOptions, ...opts, bar: { ..._defaultOptions.bar, ...opts.bar } };
    this.cores = {
      label: 'Loading',
      length: this.opts.length,
      append: [],
      pulsateSlots: [[0, 0], [this.opts.bar.pulsateLength, 100]].map(([level, value]) => ({ level, value })),
    };
    delete this.opts.length;
    this.slots = parseRatio(arr, 100, 15, false).map(level => ({ level, value: 0 }));
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
   * Return or set the max length of the progressbar
   * @returns {number|this}
   */
  length(value) {
    if (value && ['function', 'number'].includes(typeof value)) this.cores.length = value;
    else return typeof this.cores.length == 'function' ? this.cores.length() : this.cores.length;
    return this;
  }
  /**
   * Update the progressbar with certain percentages and draw
   * - Alternative to `this.update(levels).draw(template)`
   * @param {Number|Number[]} levels Level(s) to update slots with
   * @param {{}} [template] Template to use on the drawn progress bar
   */
  tick(levels, template) {
    return this.update(levels).draw(template);
  }
  /**
   * Update the progressbar slots with certain percentages
   * - This will top up the current slots with the inputed values as opposed to `this.progress(levels)`
   * @param {Number|Number[]} levels Level(s) to update the slots with
   */
  update(levels) {
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
  progress(levels = this.slots.map(slot => slot.value)) {
    [this, ...this.cores.append.filter(block => block.inherit).map(block => block.bar)].map(bar => {
      levels = levels || bar.slots.map(slot => slot.value);
      levels =
        typeof levels === 'number'
          ? Array(bar.slots.length).fill(levels)
          : Array.isArray(levels)
            ? levels
            : bar.slots.map(v => v.value);
      let invalids = levels.reduce((obj, value, index) => ((value < 0 || value > 100) && obj.push({ value, index }), obj), []);
      if (invalids.length) {
        throw Error(
          `Percentage value in <levels>[${invalids.map(v => v.index).join()}]:[${invalids
            .map(v => v.value)
            .join()}] is not valued in the range of 0..=100`
        );
      }
      bar.slots = bar.slots.map((slot, index) => ((slot.value = levels[index] || slot.value), slot));
    });
    return this;
  }
  /**
   * Get an average round up of values in percentage and current progress compatred to the total
   * @param {Number} [fixedPoint] The fixed point at which to approximate average values to
   */
  average(fixedPoint) {
    let percentage = this.slots.map(v => v.value).reduce((a, b) => a + b, 0) / (this.slots.length || 1);
    let value = (percentage / 100) * this.total;
    if (fixedPoint || fixedPoint == 0)
      [percentage, value] = [percentage, value].map(value => parseFloat(value.toFixed(fixedPoint)));
    return { percentage, value, remaining: this.total - value };
  }
  /**
   * Draw the progressbar, apply template options to the template
   * @param {String|Object} [template] The template to use on the drawn progress bar or an array of predrawn progressbar from `this.constructBar` like `this.oldBar`
   */
  draw(template) {
    let result = Array.isArray(template)
      ? template
      : (this.oldBar = [
          ...this.constructBar(template).split('\n'),
          ...this.cores.append.map(block => block.bar.constructBar(block.inherit ? template : null)),
        ]);
    this.print(`bar${result.length > 1 ? `+${result.length - 1}` : ''}`, result.join('\n'));
    this.hasBarredOnce = true;
    return this;
  }
  /**
   * Draw the progressbar, apply template options to the template
   * @param {{}} [template] The template to use on the drawn progress bar
   */
  constructBar(template) {
    let bars = !this.opts.pulsate
      ? !this.opts.forceFirst
        ? (() => {
            let total =
                this.length() - (this.opts.bar.separator.length ? this.opts.bar.separator.length * this.slots.length - 1 : 0),
              percentage = this.slots.map(({ level, value }) => ({ percentage: Math.round((level / 100) * total), value })),
              slack = total - percentage.reduce((max, { percentage }) => max + percentage, 0);
            percentage[percentage.length - 1].percentage += slack;
            return percentage.map(({ percentage, value }) => parseBar(this, percentage, value));
          })()
        : [parseBar(this, this.length(), this.average().percentage)]
      : (() => {
          let slots = this.cores.pulsateSlots;
          if (slots[0].level + slots[1].level >= 100) slots[0].level = 100 - slots[1].level;
          let total = this.length() - (this.opts.bar.separator.length ? this.opts.bar.separator.length * 2 : 0),
            stack = [...slots, { level: 100 - (slots[0].level + slots[1].level), value: 0 }],
            percentage = stack.map(({ level, value }) => ({ percentage: Math.round((level / 100) * total), value })),
            slack = total - percentage.reduce((max, { percentage }) => max + percentage, 0);
          percentage[percentage.length - 1].percentage += slack;
          let result = percentage.map(({ percentage, value }) => parseBar(this, percentage, value));
          if (slots[0].level + slots[1].level == 100) slots[0].level = 0;
          else slots[0].level += this.opts.bar.pulsateSkip;
          return result;
        })();
    let templateString = Array.isArray(this.opts.template) ? this.opts.template.join('\n') : this.opts.template,
      variable = {
        bar: bars.join(this.opts.bar.separator || ''),
        flipper: flipper(++flipper.count, this.opts.flipper),
        label: this.label(),
        percentage: this.average(2).percentage,
        get ['percentage:invert']() {
          return Math.floor(100 - this.percentage);
        },
        completed: this.average(2).value,
        total: this.total,
        ...template,
      };
    template = { ...this.opts._template, ...variable };
    for (let spec in this.opts._template) {
      if (this.opts._template[spec] !== template[spec] && typeof this.opts._template[spec] == 'function')
        template[spec] = this.opts._template[spec](variable);
    }
    return parseTemplate(templateString, template);
  }
  /**
   * Print a message after a bar `draw` interrupt
   * @param {'bar'|'end'} type Type of bar print or the first part of the printer
   * @param {any[]} content The contents to be formatted
   */
  print(type, ...content) {
    type = format(type);
    if (!process.stdout.isTTY) throw Error("Can't draw or print progressBar interrupts in piped mode");
    // If bar has ended throw error
    function cleanWrite(arr, justLogged, addons = 0) {
      if (!justLogged) {
        process.stdout.moveCursor(0, -addons);
        process.stdout.cursorTo(0);
        process.stdout.clearScreenDown();
      }
      process.stdout.write(`${justLogged ? '\n' : ''}${format(...arr)}`);
    }
    let addonPack,
      addons = this.hasBarredOnce && !this.justLogged ? this.oldBar.length - 1 : 0;
    this.justLogged =
      type === 'bar' && content.length === 1
        ? !!cleanWrite(content, this.justLogged, addons)
        : (addonPack = type.match(/^bar\+(\d)/)) !== null
          ? !!cleanWrite(content, this.justLogged, this.hasBarredOnce ? addonPack[1] : addons)
          : type === 'end'
            ? !!cleanWrite(content, !this.opts.clean, addons)
            : !cleanWrite([(type.startsWith(':') && `${type.slice(1)}`) || type, ...content], this.justLogged, addons);
    return this;
  }
  /**
   * End the bar irrespective of progress
   * @param {String} [message] The content to be written to `stdout` after to ending the bar
   */
  end(...message) {
    if (!this.isEnded) {
      if (this.justLogged) this.draw(this.oldBar);
      if (message.length) this.print('end', ...message);
      this.isEnded = true;
    }
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
   * @param {Number} [slot] The slot to be checked for completion
   * @param {Number} [fixedPoint] Fixed point approximation
   */
  isComplete(slot, fixedPoint = 100) {
    if (slot && !this.slots[slot]) throw Error(`Value in <slot>:${slot} has no slot reference`);
    return slot ? this.slots[slot].value === 100 : this.average(fixedPoint).percentage === 100;
  }
  /**
   * Append the specified bar after `this`
   * @param {ProgressBar} bar The bar to be appended
   * @param {Boolean} inherit Whether or not to inherit bar templates from `this`
   */
  append(bar, inherit = false) {
    if (!ProgressBar.isBar(bar) && !bar.opts.template) throw Error('The Parameter <bar> is not a progressbar or a hanger');
    this.cores.append.push({ bar, inherit });
    bar.cores.isKid = true;
    return this;
  }
  /**
   * Find out the progressbar is appended to another
   */
  get isChild() {
    return !!this.cores.isKid;
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
   * Check if the provided progressbar is an instance of `this`
   * @param {ProgressBar} bar The progressbar to be checked
   */
  static isBar(bar) {
    return bar instanceof this;
  }
  /**
   * Calculate slot levels by size
   * @param {number} size Maximum possible total size
   * @param {number[]} slots Each slot length, inferrable if ratio doesn't make 100 or pop-able if over 100
   */
  static slotsBySize(size, slots) {
    return slots.map(_size => (_size / size) * 100);
  }
  /**
   * Create a streamified bar for use with generators
   * @param {Number} total Total attainable value of bytes in <N>
   * @param {Number|Number[]} slots Number of slots in <%>
   * @param {{}} [opts] Options for the bar
   * @param {(bar:ProgressBar,slotLevel:Number,template:{}) => void} [actor] The actor for every yield
   */
  static stream(total, slots, opts, actor) {
    let progressBar = new this(total, slots);
    opts = {
      ...(total == Infinity
        ? {
            pulsate: true,
            template: '|%{bar%}| [%{flipper%}] %{label%} %{slot:runtime%}s %{slot:size%}',
          }
        : {}),
      ...opts,
    };
    return this.streamify(progressBar, actor, opts);
  }
  /**
   * Streamify a bar for use with generators
   * @param {ProgressBar} bar The bar to be used
   * @param {(bar:ProgressBar,slotLevel:Number,template:{}) => void} [actor] The actor for every yield
   * @param {{}} [opts] Options for the bar
   * @returns {{next(total: Number, opts: {}):NodeJS.WritableStream, bar:ProgressBar}} Returned function from `ProgressBar.streamify`
   */
  static streamify(bar, actor, opts) {
    bar.opts = { ..._streamOpts, ...bar.opts, ...opts };
    if (bar.opts.template === _defaultOptions.template) bar.opts.template = merge({}, _streamOpts, opts).template;

    let result = new EventEmitter();

    let streamGenerator = this.rawStreamify(bar, (bar, slotLevel, total = bar.total) => {
      if (!ProgressBar.isBar(bar)) throw Error('The Parameter is not a progressBar');
      let through = progressStream(
        merge({ time: 100, length: typeof total == 'function' ? total(bar) : total }, bar.opts.progress)
      );
      through
        .on('progress', progress => {
          if (typeof total == 'function') through.setLength(total(bar));
          if (bar.isEnded) return;
          let _template = {
            'slot:bar': parseBar(bar, typeof bar.length(), progress.percentage),
            'slot:size': parseBytes(progress.transferred, 2, { shorten: true }),
            'slot:size:total': parseBytes(progress.length, 2, { shorten: true }),
            'slot:percentage': progress.percentage.toFixed(0),
            'slot:eta': progress.eta,
            'slot:runtime': progress.runtime,
          };
          let level = bar.slots.map((...[, index]) => ++index === slotLevel && Math.floor(progress.percentage));
          (actor || ((bar, level, template) => bar.progress(level).draw(template()))).call(null, bar, level, () =>
            merge(_template, {
              'size:total': parseBytes(bar.total, 2, { shorten: true }),
              size: parseBytes(bar.average().value, 2, { shorten: true }),
              percentage: bar.average(0).percentage,
              eta: Math.round(bar.average().remaining / progress.speed),
            })
          );
          if (bar.isComplete()) result.emit('complete', bar);
          [through, result].map(emitter => emitter.emit('tick', { progress, bar }));
        })
        .once('error', () => bar.end());
      return (through.bar = bar), through;
    });
    return Object.assign(result, {
      /**
       * Get the next PassThrough instance
       * @param {number} [size] Size for the next chunk
       * @param {{}} [opts] Bar options
       * @returns {NodeJS.WritableStream} Returned function from `ProgressBar.streamify`
       */
      next: (size, opts) => streamGenerator.next([size, opts]).value,
      /**
       * The ProgressBar Instance
       * @type {ProgressBar} The ProgresBar
       */
      bar: streamGenerator.next().value,
    });
  }
  /**
   * Prepare a raw generator for use
   * @param {ProgressBar} bar The bar to be used
   * @param {(bar:ProgressBar, slots:Number, total?:Number) => String} actor The performing function
   * @returns {Generator} New ProgressBar Generator
   * @yields The through instance or a cache model of the ProgressBar
   */
  static *rawStreamify(bar, actor) {
    let args;
    for (let level = 0; level <= bar.slots.length; level++)
      args = !level ? yield bar : yield actor(((bar.opts = merge({}, _streamOpts, bar.opts, args[1])), bar), level, args[0]);
  }
};

/**
 * ProgressStream Events
 *  - stream -
 *  | end => Called when data all data has been written
 *  | finish => Called when all data has been flushed
 *  | tick <{progress, bar:ProgressBar}>
 * - gen -
 *  | complete <bar:ProgressBar>
 *  | tick <{progress, bar:ProgressBar}>
 */
