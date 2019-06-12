let { initCli, core } = require('./bridge');

initCli(
  process.argv,
  {
    version: '0.0.1',
  },
  {
    encrypt: core.encrypt,
    decrypt: core.decrypt,
    cachemgr: core.cachemgr,
    _encrypt(
      inputFolder,
      {
        out,
        bar,
        key,
        log,
        bytes,
        color,
        merge,
        xport,
        chunks,
        stream,
        groupBy,
        logFile,
        compress,
        compressID,
        exportFile,
        verboseLevel,
        verboseInText,
        compressMethod,
        outRelativePath,
        outResolvedPath,
      }
    ) {
      console.log(`[~] Creating archive from: ${inputFolder}`);
      console.log(`[~] Output stash: ${out}`);
      console.log(`[~] - Relative Output stash path: (${outRelativePath})`);
      console.log(`[~] - Resolved Output stash path: (${outResolvedPath})`);
      console.log(`[~] Password: ${key || '<query>'}`);
      console.log(`[~] Process: ${stream ? 'direct' : 'procedural'}`);
      console.log(`[~] Colorize: ${color}`);
      console.log(`[~] Show Progress bar: ${bar}`);
      console.log(`[-] Input Opts`);
      console.log(` - [~] Compress: ${compress}`);
      console.log(` - - [~] Compression Method: [${compressID} -> ${compressMethod}]`);
      if (bytes) console.log(`[~] Specific bytes per chunk: ${bytes}`);
      else console.log(`[~] Number of chunks to generate: ${chunks}`);
      console.log(`[-] Middle Opts`);
      console.log(` - [~] Group Chunk By: ${groupBy}`);
      console.log(` - [~] Export? ${xport}`);
      if (xport) console.log(` - - [~] ExportFile: ${exportFile}`);
      console.log(` - [~] Log? ${log}`);
      if (log) {
        console.log(` - - [~] Verbose: ${verboseLevel} <-> ${verboseInText}`);
        console.log(` - - [~] Log File: ${logFile}`);
      }
      console.log(`[-] Output Opts`);
      console.log(` - [~] Merge: ${merge}`);
    },
    _decrypt(
      inputStash,
      { key, out, log, bar, color, forceDir, logFile, verboseLevel, verboseInText, outRelativePath, outResolvedPath }
    ) {
      console.log(`[~] Archive from: ${inputStash}`);
      console.log(`[~] Output stash: ${out}`);
      console.log(`[~] - Relative Output stash path: (${outRelativePath})`);
      console.log(`[~] - Resolved Output stash path: (${outResolvedPath})`);
      console.log(`[~] Force Dir: ${forceDir}`);
      console.log(`[~] Password: ${key}`);
      console.log(`[~] Colorize: ${color}`);
      console.log(`[~] Show Progress bar: ${bar}`);
      console.log(` - [~] Log? ${log}`);
      if (log) {
        console.log(` - - [~] Verbose: ${verboseLevel} <-> ${verboseInText}`);
        console.log(` - - [~] Log File: ${logFile}`);
      }
    },
  }
);
