export interface ParsedString<T> extends String { }

/**
 * Parse a template, replace parts with specified values
 * @param template Template to be parsed
 * @param object Object containing the object parts with replaceable values
 * @param skip Part of the object to skip when checking
 */
function parseTemplate<T extends Object>(template: string, object: T): ParsedString<T>;
function parseTemplate<T extends Object>(template: string, object: T, skip: string[]): ParsedString<T>;

export = parseTemplate;
