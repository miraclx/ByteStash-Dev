/**
 * @copyright (c) 2017 Miraculous Owonubi
 * @author Miraculous Owonubi
 * @license Apache-2.0
 * @module progress2
 */

let { format } = require('util'),
  { merge } = require('lodash'),
  EventEmitter = require('events'),
  progressStream = require('progress-stream'),
  parseBytes = require('../parse-bytes'),
  parseRatio = require('../parse-ratio'),
  colorTemplate = require('../color-template'),
  parseTemplate = require('../parse-template');

let _globOpts = {
  bar: {
    blank: '-',
    filler: '#',
    header: '',
    colorize: !0,
    separator: '',
    pulsateSkip: 15,
    pulsateLength: 15,
  },
  label: 'Loading',
  clean: !1,
  length: () => (process.stdout.columns / 2 - 20) | 0,
  flipper: ['|', '/', '-', '\\'],
  pulsate: !1,
  template: '',
  variables: {
    tag: ({ tag }) => (tag && typeof tag != 'function' ? `${tag}\n` : ''),
    ...colorTemplate,
    'color:bar:empty': ':{color:close}',
    'color:bar:header': ':{color:green}',
    'color:bar:filled': ':{color:bgGreen}:{color:black}',
  },
  forceFirst: !1,
};

let _defaultOptions = {
  ..._globOpts,
  template: ':{tag}[:{bar}] :{flipper} :{label} :{percentage}% [:{completed}/:{total}]',
  variables: { ..._globOpts.variables, percentage: ({ percentage }) => `${percentage}`.padStart(3, ' ') },
};

let _streamOpts = {
  ..._globOpts,
  pulsate: false,
  progress: { time: 100, pulsate: false, infinite: !1, pulsateSkip: 15, pulsateLength: 15 },
  template: [
    ':{tag}:{label}: |:{slot:bar}| :{slot:percentage}% :{slot:eta}s [:{slot:size}/:{slot:size:total}]',
    ':{tag1}[:{bar}] :{percentage}% :{eta}s [:{size}/:{size:total}]',
  ],
  variables: {
    ..._globOpts.variables,
    eta: null,
    size: null,
    tag1: ({ label }) => `Total:`.padEnd(label.length + 2, ' '),
    transferred: null,
    ['slot:bar']: null,
    ['slot:eta']: null,
    ['slot:size']: null,
    ['slot:total']: null,
    ['slot:runtime']: null,
    ['slot:percentage']: null,
    ['slot:size:total']: null,
  },
  stageOpts: {},
  forceFirst: !0,
};

/**
 * Get a current flipper
 * @param {Number} count Value that determines the flipper
 * @param {String|String[]} flippers String or (Array of strigs) of flippers
 */
let flipper = (function() {
  function flipper(count, flippers) {
    let manageInt = (max, val) => (val > max ? manageInt(max, val - max) : val);
    return flippers[manageInt(flippers.length, count) - 1];
  }
  return (flipper.count = 0), flipper;
})();

/**
 * Parse a bar, returning a styled bar with a given percentage filled
 * @param {_defaultOptions} bar The bar being parsed
 * @param {Number} fillable Maximum fillable slots
 * @param {Number} percentage Percentage filled
 * @param {Boolean} headers Whether or not to add headers to the bar
 */
function parseBar({ opts }, fillable, percentage, headers = !opts.pulsate) {
  fillable = Math.round(fillable);
  let filled = Math.round((percentage / 100) * fillable),
    empty = fillable - filled,
    { filler, blank, header } = opts.bar;
  [filled, empty] = [filled, empty].map(v => v | 0);
  [filler, blank] = [filler, blank].map(content => (Array.isArray(content) || typeof content === 'string' ? content : ''));
  return parseTemplate(
    [
      `:{color:bar:filled}${filler.repeat(filled)}`,
      `:{color:bar:header}${headers ? header : ''}`,
      `:{color:bar:empty}${blank.repeat(empty, 0)}`,
    ].join(':{color:close}:{color:bgClose}'),
    opts.variables
  );
}

/**
 * Create a pulsate bar
 * @param {ProgressBar} bar The bar to be pulsated
 * @param {Array} slots Pulsate slots to be used
 * @param {number} skip Valuation for by how much to skip the bar
 */
function pulsateBar(bar, slots, skip) {
  if (slots[0].level + slots[1].level >= 100) slots[0].level = 100 - slots[1].level;
  let total = bar.length(),
    stack = [...slots, { level: 100 - (slots[0].level + slots[1].level), value: 0 }].map(({ level, value }) => ({
      fillable: Math.round((level / 100) * total),
      percentage: value,
    }));
  if (slots[0].level + slots[1].level == 100) slots[0].level = 0;
  else slots[0].level += skip;
  return ((stack.slice(-1).pop().fillable += total - stack.reduce((max, { fillable }) => max + fillable, 0)), stack).map(
    ({ fillable, percentage }) => parseBar(bar, fillable, percentage, false)
  );
}

module.exports = class ProgressBar {
  /**
   * Build a progress bar
   * @param {Number} total Max attainable value by the progressBar
   * @param {Number[]} arr Allocation of slots in <%>
   * @param {_defaultOptions} opts Attachable options
   */
  constructor(total, arr = [100], opts = {}) {
    if (!(total && typeof total == 'number')) throw Error('<ProgressBar> must have a max value');
    this.opts = {
      ..._defaultOptions,
      ...opts,
      bar: { ..._defaultOptions.bar, ...opts.bar },
      variables: { ..._defaultOptions.variables, ...opts.variables },
    };
    this.cores = {
      total,
      label: this.opts.label,
      length: this.opts.length,
      append: [],
      pulsateSlots: [[0, 0], [this.opts.bar.pulsateLength, 100]].map(([level, value]) => ({
        level,
        value,
      })),
    };
    delete this.opts.label;
    delete this.opts.length;
    let self = this;
    this.slots = parseRatio(arr, 100, 15, !1).map(level => ({
      level,
      value: 0,
      get max() {
        return (self.total() * level) / 100;
      },
      get done() {
        return (this.value / 100) * this.max;
      },
    }));
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
   * @param {number} [value] The value to set the progressBar length to
   */
  length(value) {
    return value && ['function', 'number'].includes(typeof value)
      ? ((this.cores.length = value), this)
      : typeof this.cores.length == 'function'
        ? this.cores.length()
        : this.cores.length;
  }
  /**
   * Return or update the total level of the progressbar
   * @param {number} [value] The number to be added to the total level
   * @param {{}} [template] Template variable values to be included into core options
   */
  total(value, template) {
    if (value | 0) {
      if (value < this.average().completed) throw new Error(`<value> must not be lower than already completed value`);
      this.slots.map(v => (v.value = (v.value * this.total()) / value));
      this.cores.total = value | 0 ? value : 0;
      Object.assign(this.opts.template, template);
      return this;
    }
    return this.cores.total;
  }

  value(index, value, template) {
    function parse(max, val, result) {
      if (val > max) throw Error(`Value [${val}] is larger than maximum [${max}]`);
      else if (val < 0) throw Error(`Value [${val}] is less than 0`);
      return result;
    }
    let res;
    if (arguments.length > 1 && value && typeof value !== 'object')
      res = [
        index,
        parse(this.slots[index].max, Math.round(value), (value * 100 ** 2) / (this.slots[index].level * this.total())),
      ];
    else
      [template, res] = [
        value,
        [
          Array.isArray(index)
            ? this.slots
                .slice(0, index.length)
                .map((v, i) => parse(v.max, Math.round(index[i]), (index[i] * 100 ** 2) / (v.level * this.total())))
            : parse(this.total(), Math.round(index), (index / this.total()) * 100),
        ],
      ];
    return this.progress(...res, template);
  }
  /**
   * Update the progressbar slots with certain percentages
   * - This will top up the current slots with the inputed values as opposed to `this.progress(levels)`
   * - The progressbar would be automatically drawn if [template] is provided
   * @param {Number|Number[]} levels Level(s) to update the slots with
   * @param {{}} [template] Template variable values to use on the drawn progress bar
   */
  tick(levels, template) {
    levels =
      typeof levels === 'number'
        ? Array(this.slots.length).fill(levels)
        : Array.isArray(levels)
          ? levels
          : this.current.map(v => v.value || 0);
    let res;
    return this.progress(
      this.slots.map((slot, index) => ((res = slot.value + (levels[index] | 0)), res > 100 ? 100 : res)),
      template
    );
  }
  /**
   * Update the progressbar to a percentage
   * - The progressbar would be automatically drawn if [template] is provided
   * @param {number|number[]} index The index at which to replace percentage or an array of slot percentages
   * @param {number} [value] if (index::number) the percentage for the specified index
   * @param {{}} [template] Template variable values to use on the drawn progress bar
   * @example
   *  > this.progress(50, {}) // Update the entire bar to 50%
   *  > this.progress(1, 20, {}) // Set the percentage of the first slot to 20%
   *  > this.progress([40,20,70], {}) // Set the percentage of the slots according to array specification
   */
  progress(index, value, template) {
    if (this.isEnded) throw Error('This bar has been ended and is now immutable');
    let [parseType, inferParse] = [
      (input, msg) => {
        if (!(Array.isArray(input) ? input : [input]).every(v => typeof v == 'number')) throw new Error(msg);
        else return input;
      },
      (slots, value, index) => {
        slots[index].value =
          parseType(
            value <= 0 || (value | 0) > 100 || value > 100 ? value | 0 : value,
            `Percentage [${value}] must be in the range [0 < X < 100]`
          ) || slots[index].value;
      },
    ];
    let bars = [this, ...this.cores.append.reduce((a, v) => (v.inherit && a.push(v.bar), a), [])];
    if (arguments.length > 1 && value && typeof value !== 'object')
      parseType(
        [index, value <= 0 || (value | 0) > 100 || value > 100 ? value | 0 : value],
        `<index> and <value> must be of type \`number\`, <number> must be in the range [0 < X < 100]`
      ),
        bars.map(({ slots }) => (slots[index].value = value || slots[index].value));
    else
      (template = value),
        bars.map(
          ({ slots }) =>
            Array.isArray(index)
              ? index.map((value, i) => inferParse(slots, value, i))
              : slots.map((_slot, i) => inferParse(slots, index, i))
        );

    return !template ? this : this.draw(template);
  }
  /**
   * Get an average round up of values in percentage and current progress compatred to the total
   * @param {Number} [fixedPoint] The fixed point at which to approximate average values to
   * @returns {{completed:number, remaining:number, percentage:number}}
   */
  average(fixedPoint = 100) {
    let completed = this.slots.reduce((a, b) => a + b.done, 0),
      percentage = (completed / this.total()) * 100,
      remaining = this.total() - completed;
    [percentage, completed, remaining] = [percentage, completed, remaining].map(value => parseFloat(value.toFixed(fixedPoint)));
    return { completed, remaining, percentage };
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
    this.print(`bar${result.length ? `+${result.length - 1}` : ''}`, result.join('\n'));
    this.hasBarredOnce = !0;
    return this;
  }
  constructBar(template) {
    let bars = !this.opts.pulsate
      ? !this.opts.forceFirst
        ? (() => {
            let total =
                this.length() +
                [[this.opts.bar.header, 0], [this.opts.bar.separator, -1]].reduce(
                  (a, [v, e]) => a - (v.length ? v.length * this.slots.length + e : 0),
                  0
                ),
              slotting = this.slots.map(({ level, value }) => ({ portion: ((level / 100) * total) | 0, value })),
              slack = total - slotting.reduce((max, { portion }) => max + portion, 0);
            if (slack > total / 5 || total < 0)
              throw new Error(
                `Resultant bar length is less than max bar length, consider ${
                  [this.opts.bar.header, this.opts.bar.separator].some(v => !!v) ? 'removing separator and headers or ' : ''
                }increasing bar length or using the \`forceFirst\` option`
              );
            slotting.slice(-1).pop().portion += slack;
            let result = slotting.map(({ portion, value }) => parseBar(this, portion, value));
            return result;
          })()
        : [
            parseBar(this, this.length() - this.opts.bar.header.length, this.average().percentage),
            ...(this.opts.header ? [this.opts.header] : []),
          ]
      : pulsateBar(this, this.cores.pulsateSlots, this.opts.bar.pulsateSkip);
    let templateString = Array.isArray(this.opts.template) ? this.opts.template.join('\n') : this.opts.template;
    return this.parseString(templateString, {
      bar: bars.join(this.opts.bar.separator || ''),
      label: this.label(),
      total: this.total(),
      average: this.average(0),
      flipper: flipper(++flipper.count, this.opts.flipper),
      ...this.average(0),
      ...template,
    });
  }

  parseString(str, template) {
    let variables = { ...(template = { ...this.opts.variables, ...template }) };
    for (let [spec, content] of Object.entries(this.opts.variables))
      typeof content == 'function' && content !== template[spec] && (template[spec] = content(template));
    return parseTemplate(parseTemplate(str, template), variables);
  }
  /**
   * Print a message after a bar `draw` interrupt
   * @param {'bar'|'end'} type Type of bar print or the first part of the printer
   * @param {any[]} content The contents to be formatted
   */
  print(type, ...content) {
    let self = this;
    type = format(type);
    if (!process.stdout.isTTY) throw Error("Can't draw or print progressBar interrupts with piped stdout");
    let cleanWrite = function(arr, dontClean, addons = 0) {
      if (!dontClean) {
        process.stdout.moveCursor(0, -addons);
        process.stdout.cursorTo(0);
        process.stdout.clearScreenDown();
      }
      process.stdout.write(
        `${dontClean ? '\n' : ''}${self.parseString(format(...arr)).replace(self.opts.bar.colorize ? '' : /\x1b\[\d+m/g, '')}`
      );
    };
    let addonPack,
      addons = this.hasBarredOnce && !this.justLogged ? this.oldBar.length - 1 : 0;
    this.justLogged =
      type === 'bar' && content.length === 1
        ? !!cleanWrite(content, this.justLogged, addons)
        : (addonPack = type.match(/^bar\+(\d+)/)) !== null
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
      this.isEnded = !0;
    }
    return this;
  }
  /**
   * Drain all slots in the progressbar to 0
   */
  drain(slotID) {
    if (slotID) this.slots[slotID].level = 0;
    else this.slots.map(slot => ((slot.value = 0), slot));
    return this;
  }
  /**
   * Drop the chain, return void
   */
  drop() {}
  /**
   * Append the specified bar after `this`
   * @param {ProgressBar} bar The bar to be appended
   * @param {Boolean} inherit Whether or not to inherit bar templates from `this`
   */
  append(bar, inherit = !1) {
    if (!ProgressBar.isBar(bar) && !bar.opts.template) throw Error('The Parameter <bar> is not a progressbar or a hanger');
    this.cores.append.push({ bar, inherit });
    bar.cores.isKid = !0;
    return this;
  }
  /**
   * Check if the bar or a slot is complete
   * @param {Number} [slot] The slot to be checked for completion
   */
  isComplete(slot) {
    if (slot && !this.slots[slot]) throw Error(`Value in <slot>:${slot} has no slot reference`);
    return slot ? this.slots[slot].value === 100 : this.average(0).percentage === 100;
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
    return this.isActive && !this.average().completed;
  }
  /**
   * Check if the provided progressbar is an instance of `this`
   * @param {ProgressBar} bar The progressbar to be checked
   */
  static isBar(bar) {
    return bar instanceof this;
  }
  /**
   * Check if the provided progressbar is an stream instance of `this`
   * @param {ProgressBar} bar The progressbar to be checked
   */
  static isBarStream(barStream) {
    return (
      barStream &&
      this.isBar(barStream.bar) &&
      barStream instanceof EventEmitter &&
      [barStream.read, barStream.write].every(slot => typeof slot == 'function')
    );
  }
  /**
   * Check if the provided object is a stream progressbar generator
   * @param {any} bar The progressbar to be checked
   */
  static isBarGen(barStream) {
    return barStream && this.isBar(barStream.bar) && barStream instanceof EventEmitter && typeof barStream.next == 'function';
  }
  /**
   * Check if the provided object is related to any instances created by this script
   * @param {any} bar The progressbar to be checked
   */
  static isBarRelated(barStream) {
    return this.isBar(barStream) || this.isBarStream(barStream) || this.isBarGen(barStream);
  }
  /**
   * Calculate slot levels by number of slots
   * @param {number} len Each slot length, inferrable if ratio doesn't make 100 or pop-able if over 100
   */
  static slotsByCount(len) {
    return Array(len).fill(100 / len);
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
   * @param {_streamOpts} [opts] Options for the bar
   * @param {(bar:ProgressBar,slotLevel:Number,template:{}) => void} [actor] The actor for every yield
   */
  static stream(total, slots, opts, actor) {
    opts = {
      ...(total == Infinity
        ? {
            pulsate: !0,
            template: ':{tag}[:{bar}] [:{flipper}] :{label} :{slot:runtime}s :{slot:size}',
          }
        : {}),
      ...opts,
      ...(slots == Infinity ? ((slots = 100), { progress: { infinite: !0 } }) : {}),
    };
    let progressBar = new this(total, slots, opts);
    return this.streamify(progressBar, actor);
  }
  /**
   * Streamify a bar for use with generators
   * @param {ProgressBar} bar The bar to be used
   * @param {(bar:ProgressBar, slotLevel:Number, template:() => {completed:number, remaining:number, percentage:number}) => void} [actor] The actor for every yield
   * @param {_streamOpts} [opts] Options for the bar
   * @returns {{next(size: Number, opts: _streamOpts):NodeJS.WritableStream, bar:ProgressBar}} Returned function from `ProgressBar.streamify`
   */
  static streamify(bar, actor, opts) {
    bar.opts = merge({}, _streamOpts, bar.opts, opts);
    let [pulsateSlots, pulsateSkips] = [
        [[0, 0], [bar.opts.progress.pulsateLength || bar.opts.bar.pulsateLength, 100]].map(([level, value]) => ({
          level,
          value,
        })),
        bar.opts.progress.pulsateSkip || bar.opts.bar.pulsateSkip,
      ],
      result = new EventEmitter(),
      streamGenerator = bar.slotStreamify((bar, slotIndex, total, infinite) => {
        let max = !infinite ? Math.round((bar.slots[slotIndex].level / 100) * bar.total()) : Infinity;
        total = typeof total == 'function' ? total(bar) : total || max;
        if (!infinite && total > max)
          throw Error(
            `<size> slot must not be greater than maximum possible size for the slot [${max}], consider using infinite slots`
          );
        let through = progressStream({ length: total, ...bar.opts.progress })
          .on('progress', progress => {
            if (bar.isEnded) through.emit('error', Error('The <bar> being used has been ended'));
            (actor || ((bar, args, template) => bar.value(...args, template)))(
              bar,
              bar.opts.progress.infinite ? [progress.delta + bar.average().completed] : [slotIndex, progress.transferred],
              {
                eta: () => Math.round(bar.average().remaining / progress.speed),
                size: () => parseBytes(bar.average().completed, 2, { shorten: !0 }),
                progress,
                'slot:bar': () =>
                  bar.opts.progress.pulsate
                    ? pulsateBar(bar, pulsateSlots, pulsateSkips).join('')
                    : parseBar(bar, bar.length() - (bar.opts.bar.header || '').length, progress.percentage),
                'slot:eta': progress.eta,
                'slot:size': parseBytes(progress.transferred, 2, { shorten: !0 }),
                'size:total': () => parseBytes(bar.total(), 2, { shorten: !0 }),
                'slot:runtime': progress.runtime,
                'slot:percentage': progress.percentage.toFixed(0),
                'slot:size:total': parseBytes(progress.length, 2, { shorten: !0 }),
              }
            );
            if (bar.isComplete()) result.emit('complete', bar);
            [through, result].map(emitter => emitter.emit('tick', { progress, bar }));
          })
          .once('error', error => bar.end(`:{color:red}[Bar Error]:{color:close} An Error occurred\n${error}`));
        return (through.bar = bar), through;
      });
    return Object.assign(result, {
      /**
       * Get the next PassThrough instance
       * @param {number} [size] Size for the next chunk (Omittable)
       * @param {_streamOpts} [opts] Bar options
       * @returns {NodeJS.WritableStream} Returned function from `ProgressBar.streamify`
       */
      next: (size, opts) => streamGenerator.next([...(typeof size === 'number' ? [size, opts] : [void 0, size])]).value,
      /**
       * The ProgressBar Instance
       * @type {ProgressBar} The ProgresBar
       */
      bar: streamGenerator.next().value,
    });
  }
  /**
   * Prepare a raw generator for use
   * @param {(bar:ProgressBar, slots:Number, total?:Number) => String} actor The performing function
   * @returns {Generator} New ProgressBar Generator
   * @yields The through instance or a cache model of the ProgressBar
   */
  *slotStreamify(actor, args) {
    for (let level = -1; ++level <= (this.opts.progress.infinite ? Infinity : this.slots.length); )
      args = yield !level
        ? this
        : (merge(this.opts, args[1]), actor(this, (level - 1) | 0, args[0], this.opts.progress.infinite));
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
