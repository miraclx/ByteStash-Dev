let ProgressBar = require('../libs/ProgressBar');

function main() {
  let bar = new ProgressBar(50 * 1024, Array(5).fill(20), {
    bar: {
      separator: '|',
      header: '\ue0b0',
    },
    pulsate: true,
    forceFirst: true,
  });
  // let bar = new ProgressBar(50 * 1024, Array(5).fill(20));

  let interval = setInterval(function() {
    let up = Math.floor(Math.random() * 10);
    bar.tick(up, {
      message: 'Updating with ' + up,
    });
    if (bar.isComplete()) {
      clearInterval(interval);
      bar.end('The Progress Completed\n');
    }
  }, 100);
}

main();

/**
 * > node simple.js
 */
