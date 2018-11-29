let ProgressBar = require('../libs/ProgressBar');

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
      'Percentage: [%{_percentage%}%]',
      'Total:      [%{total%}]',
      'Completed:  [%{_completed%}]',
      'Remaining:  [%{remaining%}]',
      'Status:     %{message%}',
      '%{label%} |%{bar%}| [%{flipper%}]',
    ],
    _template: {
      remaining({completed, total}) {
        return (total - completed).toFixed(0).padStart(5, ' ');
      },
      _percentage({percentage}) {
        return percentage.toString().padStart(4, ' ');
      },
      _completed({completed}) {
        return completed.toFixed(0).padStart(5, ' ');
      },
    },
    // clean: true,
  });
  let interval = setInterval(function() {
    let up = Math.floor(Math.random() * 10);
    bar.tick(up, {
      message: 'Updating with ' + up,
    });
    if (bar.isComplete()) {
      clearInterval(interval);
      bar.end('The Progress Completed\n');
    }
  }, 700);
}

main();
