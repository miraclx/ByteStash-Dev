let ProgressBar = require('../libs/progress2');

void (function main() {
  // Define a new ProgressBar to a max with a single slot
  let bar = new ProgressBar(50 * 2 ** 10, 100),
    // Initiate an interval to update the bar
    // At every interval, selct an upgrade value from 1 to 10
    interval = setInterval((up = (Math.random() * 10) | 0 || 1) => {
      // Use the upgrade value to update the progressbar with
      if (bar.tick(up, { tag: `Updating with ${up}` }).isComplete()) {
        // Check if the bar is complete, if it is, collapse the interval and end the bar
        clearInterval(interval), bar.end('The Progress Completed\n');
      }
      // Set the interval time of 100ms
    }, 100);
})();

/**
 * > node simple.js
 */
