const _ = require('lodash'),
  chalk = require('chalk'),
  ProgressBar = require('../libs/ProgressBarArr');

let colorsObj = {
  bg: [
    'bgWhite',
    'bgWhiteBright',
    'bgBlack',
    'bgBlackBright',
    'bgRed',
    'bgRedBright',
    'bgYellow',
    'bgYellowBright',
    'bgGreen',
    'bgGreenBright',
    'bgBlue',
    'bgBlueBright',
    'bgCyan',
    'bgCyanBright',
    'bgMagenta',
  ],
  fg: ['white', 'black', 'red', 'yellow', 'green', 'blue', 'cyan', 'gray', 'grey'],
};

/**
 * Color-ify the progressbar for every update
 * @param {ProgressBar} progressBar The progressbar
 * @param {*} colors The color object
 */
function startExec(progressBar, colors = colorsObj) {
  progressBar = ProgressBar.isBar(progressBar)
    ? progressBar
    : new ProgressBar(100, [...Array(20)].map(() => Math.random() * 10), {colorize: true, clean: true});
  progressBar.opts.template = `${chalk.underline('%{label%}')} [%{bar%}] [%{percentage%}%]`;
  let timer = setInterval(() => {
    progressBar.opts.bar = _.merge({}, progressBar.opts.bar, {
      color: [
        colors.bg[Math.floor(Math.random() * (colors.bg.length - 1))],
        colors.fg[Math.floor(Math.random() * (colors.fg.length - 1))],
      ],
    });
    let random = progressBar.slots.map(({value}) => (value < 100 ? Math.random() * 10 : 0));
    if (progressBar.isComplete()) {
      progressBar.end('Completed!\n');
      return clearInterval(timer);
    }
    progressBar.tick(random);
  }, 1000);
  return progressBar;
}

startExec();
