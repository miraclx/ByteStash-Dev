let ProgressBar = require('../libs/progress2');

function padContent(val, all) {
  return val.toFixed(0).padStart(Math.max(`${all}`.length, 3), ' ');
}

function main() {
  let max = 50 * 1024;
  let slots = Array(5).fill(20);
  let bar = new ProgressBar(max, slots, {
    bar: {
      filler: '#',
      blank: '-',
      color: ['bgRed', 'white'],
    },
    template: [
      'Percentage: [%{percentage%}%]',
      'Total:      [%{total%}]',
      'Completed:  [%{completed%}]',
      'Remaining:  [%{remaining%}]',
      'Status:     %{message%}',
      '%{label%} |%{bar%}| [%{flipper%}]',
    ],
    variables: {
      total: ({ total }) => padContent(total, bar.total()),
      completed: ({ completed }) => padContent(completed, bar.total()),
      remaining: ({ completed, total }) => padContent(total - completed, bar.total()),
      percentage: ({ percentage }) => padContent(percentage, bar.total()).slice(1),
    },
  });

  let interval = setInterval(function() {
    let up = Math.round(Math.random() * 2000);
    if (!(bar.average().percentage % 10)) bar.opts.pulsate = !bar.opts.pulsate;
    bar.value(bar.average().completed + up, {
      message: `${bar.opts.pulsate ? 'Pulsating' : 'Updating'} + ${up}`,
    });
    if (bar.isComplete()) {
      clearInterval(interval);
      bar.end('The Progress Completed\n');
    }
  }, 1500);
}

main();

/**
 * > node indepth.js
 */
