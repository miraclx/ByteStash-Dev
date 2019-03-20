let _ = require('lodash'),
  chalk = require('chalk'),
  ansiStyles = require('ansi-styles'),
  ProgressBar = require('../libs/progress2');

let colorsObj = {
  bg: Object.keys(ansiStyles.bgColor).filter(v => !['ansi', 'ansi16m', 'ansi256', 'close'].includes(v)),
  fg: Object.keys(ansiStyles.color).filter(v => !['ansi', 'ansi16m', 'ansi256', 'close'].includes(v)),
};

/**
 * Color-ify the progressbar for every update
 * @param {*} colors The color object
 */
function main(colors = colorsObj) {
  let bar = new ProgressBar(100, [...Array(20)].map(() => Math.random() * 10), {
    clean: true,
    colorize: true,
    template: `${chalk.underline(':{label}')} :{bar} [:{percentage}%]`,
    forceFirst: false,
  });
  let timer = setInterval(() => {
    bar.opts.bar = _.merge({}, bar.opts.bar, {
      color: [
        colors.bg[Math.floor(Math.random() * (colors.bg.length - 1))],
        colors.fg[Math.floor(Math.random() * (colors.fg.length - 1))],
      ],
    });
    let random = bar.slots.map(({ value }) => (value < 100 ? Math.random() * 10 || 1 : 1));
    bar.print(random);
    bar.tick(random).draw();
    if (bar.isComplete()) bar.end('Completed!\n'), clearInterval(timer);
  }, 1000);
  return bar;
}

main();

/**
 * > node colorize.js  // Spawn a colorized progressbar
 */
