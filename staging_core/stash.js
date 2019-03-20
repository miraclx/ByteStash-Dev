let path = require('path'),
  { Stats } = require('fs'),
  { XMAP } = require('./engine');

class StashObject {
  constructor(path, { stat, folder }) {
    this.path = path;
    this.type = folder ? 'folder' : 'object';
    this.stat = stat instanceof Stats ? stat : new Stats();
    this.content = folder ? {} : null;
  }
  listing() {
    if (this.type !== 'folder') throw Error('Unable to call <:StashObject>.listing() for an object not of type [folder]');
    return this.content;
  }
}

class Stash {
  constructor(xmap) {
    this.xmap = xmap instanceof XMAP ? xmap : new XMAP(xmap);
    this.stack = new StashObject('/', { folder: true });
  }
  getMap({ content } = this.stack, rootStack = {}) {
    Object.values(content).map(stack => {
      rootStack[stack.path] = stack;
      if (stack.content) this.getMap(stack, rootStack);
    });
    return rootStack;
  }
  add(_path, folder = false, forceParent = false) {
    let { name, file, location } = this.dig(_path, folder, forceParent);
    if (location[name]) throw Error(`Unable to replace ${file}, try delete`);
    location[name] = new StashObject(file, { folder });
    return this;
  }
  delete(_path) {
    let { name, file, location } = this.dig(_path);
    if (!location[name]) throw Error(`Unable to delete ${file}, does not exist`);
    delete location[name];
    return this;
  }
  dig(_path, folder, forceParent) {
    let [nestLocation, location] = ['/', this.stack.listing()];
    let pathMap = _path.split('/').filter(Boolean);
    let name = pathMap.splice(-1)[0];

    for (let dirname of pathMap) {
      nestLocation = path.join(nestLocation, dirname);
      if (location[dirname] instanceof StashObject)
        if (location[dirname].type == 'folder') location = location[dirname].listing();
        else throw Error(`The path ${nestLocation} is an object, use a collection path instead`);
      else if (forceParent) {
        this.add(nestLocation, true);
        location = location[dirname].listing();
      } else throw Error(`The path ${nestLocation} does not exist`);
    }
    return { name, file: path.join(nestLocation, name), location };
  }
}

module.exports = { Stash, StashObject };
