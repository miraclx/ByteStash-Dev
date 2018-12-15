let _ = require('lodash'),
  chalk = require('chalk'),
  ansiStyles = require('ansi-styles'),
  ProgressBar = require('../libs/ProgressBar');

let colorsObj = {
  bg: Object.getOwnPropertyNames(ansiStyles.bgColor).filter(v => !['ansi', 'ansi16m', 'ansi256', 'close'].includes(v)),
  fg: Object.getOwnPropertyNames(ansiStyles.color).filter(v => !['ansi', 'ansi16m', 'ansi256', 'close'].includes(v)),
};

/**
 * Color-ify the progressbar for every update
 * @param {ProgressBar} progressBar The progressbar
 * @param {*} colors The color object
 */
function startExec(progressBar, colors = colorsObj) {
  progressBar = ProgressBar.isBar(progressBar)
    ? progressBar
    : new ProgressBar(100, [...Array(20)].map(() => Math.random() * 10), {
        colorize: true,
        clean: true,
        forceFirst: false,
        template: `${chalk.underline('%{label%}')}%{_bar%} [%{percentage%}%]`,
        _template: {
          _bar({ bar }) {
            return bar ? ` [${bar}]` : '';
          },
        },
      });
  let timer = setInterval(() => {
    progressBar.opts.bar = _.merge({}, progressBar.opts.bar, {
      color: [
        colors.bg[Math.floor(Math.random() * (colors.bg.length - 1))],
        colors.fg[Math.floor(Math.random() * (colors.fg.length - 1))],
      ],
    });
    let random = progressBar.slots.map(({ value }) => (value < 100 ? Math.random() * 10 : 0));
    if (progressBar.isComplete()) {
      progressBar.end('Completed!\n');
      return clearInterval(timer);
    }
    progressBar.tick(random);
  }, 1000);
  return progressBar;
}

startExec();

/**
 * > node colorize.js  // Spawn a colorized progressbar
 */
