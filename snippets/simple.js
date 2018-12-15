let ProgressBar = require('../libs/ProgressBar');

function main() {
  let bar = new ProgressBar(50 * 1024, 100);

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

/**
 * > node simple.js
 */
