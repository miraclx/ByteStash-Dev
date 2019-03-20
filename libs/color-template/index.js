let ansiStyles = require('ansi-styles');
let bg, fg, mod;
let colors = ({ bg, fg, mod } = { bg: [], fg: [], mod: [] });
for (let [stack, color] of [[bg, ansiStyles.bgColor], [fg, ansiStyles.color], [mod, ansiStyles.modifier]])
  stack.push(...Object.keys(color).filter(v => !['ansi', 'ansi16m', 'ansi256', 'close'].includes(v)));
let _colorTemplate = {
  'color:close': ansiStyles.color.close,
  'color:random': () => ansiStyles[colors.fg[(Math.random() * colors.fg.length) | 0]].open,
  'color:bgClose': ansiStyles.bgColor.close,
  'color:bgRandom': () => ansiStyles[colors.bg[(Math.random() * colors.bg.length) | 0]].open,
};
for (let color of colors.mod)
  _colorTemplate = {
    ..._colorTemplate,
    [`color:${color}`]: ansiStyles[color].open,
    [`color:${color}:close`]: ansiStyles[color].close,
  };
for (let color of [...colors.bg, ...colors.fg]) _colorTemplate[`color:${color}`] = ansiStyles[color].open;
module.exports = _colorTemplate;
