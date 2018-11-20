/**
 * Make bytes human readable
 * @param {ByteString} bytes Number of bytes to be parsed
 * @param {Number} fixedPoint Number of decimal points
 * @param {{shorten:Boolean, bits: Boolean}} param2 Options
 */
module.exports = function parseBytes(
  bytes = 0,
  fixedPoint = 2,
  {bi = false, shorten = true, bits = false, addSpace = false} = {}
) {
  let sizes = !bi
    ? ['-', 'Kilo-', 'Mega-', 'Giga-', 'Tera-', 'Peta-', 'Exa-', 'Zetta-', 'Yotta-']
    : ['-', 'Kibi-', 'Mebi-', 'Gibi-', 'Tebi-', 'Pebi-', 'Exbi-', 'Zebi-', 'Yobi-'];
  let exponent = Math.floor(Math.log(bytes) / Math.log(bi ? 1024 : 1000)) || 0;
  let size = sizes[exponent] || sizes[0];
  return `${((bytes * (bits ? 8 : 1)) / Math.pow(bi ? 1024 : 1000, exponent)).toFixed(fixedPoint)}${addSpace ? ' ' : ''}${
    !shorten
      ? size.replace(/-/g, !bits ? 'Bytes' : 'Bits')
      : `${!shorten ? size : size[0].replace(/(-?|[^\w])$/, `${bi && exponent in sizes && exponent > 0 ? 'i' : ''}`)}${
          !bits ? 'B' : 'b'
        }`
  }`;
};
