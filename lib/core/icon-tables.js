"use strict";

const Icon = require("./icon.js");


/**
 * Interface providing access to the package's databases.
 *
 * @property {Array} directoryIcons - Icons to match directory-type resources.
 * @property {Array} fileIcons      - Icons to match file resources.
 * @property {Icon}  binaryIcon     - Icon for binary files.
 * @property {Icon}  executableIcon - Icon for executables.
 * @class
 */
class IconTables{
	
	/**
	 * Load and parse compiled icon tables.
	 *
	 * @example new IconTables("./icons/.icondb.js");
	 * @param {String} source - Path to compiled source
	 * @constructor
	 */
	constructor(source){
		this.directoryIcons = null;
		this.fileIcons      = null;
		this.binaryIcon     = null;
		this.executableIcon = null;
		
		this.cache = {
			directoryName: new Map(),
			directoryPath: new Map(),
			fileName:      new Map(),
			filePath:      new Map(),
			interpreter:   new Map(),
			scope:         new Map(),
			language:      new Map(),
			signature:     new Map(),
		};
		
		const data = require(source);
		this.directoryIcons = this.read(data[0]);
		this.fileIcons      = this.read(data[1]);
		this.binaryIcon     = this.matchScope("source.asm");
		this.executableIcon = this.matchInterpreter("bash");
	}
	
	
	/**
	 * Populate icon-lists from a compiled data table.
	 *
	 * @param {Array} table
	 * @return {Object}
	 * @internal
	 */
	read(table){
		let [icons, indexes] = table;
		icons = icons.map((i, offset) => new Icon(offset, ...i));
		
		// Dereference Icon instances from their stored offset
		indexes = indexes.map(index => index.map(offset => icons[offset]));
		
		const [
			byInterpreter,
			byLanguage,
			byPath,
			byScope,
			bySignature,
		] = indexes;
		
		return {
			byName: icons,
			byInterpreter,
			byLanguage,
			byPath,
			byScope,
			bySignature,
		};
	}
	
	
	/**
	 * Match an icon using a resource's basename.
	 *
	 * @param {String} name - Name of filesystem entity
	 * @param {Boolean} [directory=false] - Match folders instead of files
	 * @return {Icon}
	 */
	matchName(name, directory = false){
		const [cachedIcons, icons] = directory
			? [this.cache.directoryName, this.directoryIcons.byName]
			: [this.cache.fileName,      this.fileIcons.byName];
		const cached = cachedIcons.get(name);
		if(cached) return cached;
		for(const icon of icons)
			if(icon.match.test(name)){
				cachedIcons.set(name, icon);
				return icon;
			}
		return null;
	}
	
	
	/**
	 * Match an icon using a resource's system path.
	 *
	 * @param {String} path - Full pathname to check
	 * @param {Boolean} [directory=false] - Match folders instead of files
	 * @return {Icon}
	 */
	matchPath(path, directory = false){
		const [cachedIcons, icons] = directory
			? [this.cache.directoryName, this.directoryIcons.byPath]
			: [this.cache.fileName,      this.fileIcons.byPath];
		const cached = cachedIcons.get(path);
		if(cached) return cached;
		for(const icon of icons)
			if(icon.match.test(path)){
				cachedIcons.set(path, icon);
				return icon;
			}
		return null;
	}
	
	
	/**
	 * Match an icon using the human-readable form of its related language.
	 *
	 * Typically used for matching modelines and Linguist-language attributes.
	 *
	 * @example IconTables.matchLanguage("JavaScript")
	 * @param {String} name - Name/alias of language
	 * @return {Icon}
	 */
	matchLanguage(name){
		const cached = this.cache.language.get(name);
		if(cached) return cached;
		for(const icon of this.fileIcons.byLanguage)
			if(icon.lang.test(name)){
				this.cache.language.set(name, icon);
				return icon;
			}
		return null;
	}
	
	
	/**
	 * Match an icon using the grammar-scope assigned to it.
	 *
	 * @example IconTables.matchScope("source.js")
	 * @param {String} name
	 * @return {Icon}
	 */
	matchScope(name){
		const cached = this.cache.scope.get(name);
		if(cached) return cached;
		for(const icon of this.fileIcons.byScope)
			if(icon.scope.test(name)){
				this.cache.scope.set(name, icon);
				return icon;
			}
		return null;
	}
	
	
	/**
	 * Match an icon using the name of an interpreter which executes its language.
	 *
	 * Used for matching interpreter directives (a.k.a., "hashbangs").
	 *
	 * @example IconTables.matchInterpreter("bash")
	 * @param {String} name
	 * @return {Icon}
	 */
	matchInterpreter(name){
		const cached = this.cache.interpreter.get(name);
		if(cached) return cached;
		for(const icon of this.fileIcons.byInterpreter)
			if(icon.interpreter.test(name)){
				this.cache.interpreter.set(name, icon);
				return icon;
			}
		return null;
	}
	
	
	/**
	 * Match an icon using a resource's file signature.
	 *
	 * @example IconTables.matchSignature("\x1F\x8B")
	 * @param {String} data
	 * @return {Icon}
	 */
	matchSignature(data){
		const cached = this.cache.signature.get(data);
		if(cached) return cached;
		for(const icon of this.fileIcons.bySignature)
			if(icon.signature.test(data)){
				this.cache.signature.set(data, icon);
				return icon;
			}
		
		// Special case: Assume anything containing null-bytes is binary
		if(/\0/.test(data)){
			this.cache.signature.set(data, this.binaryIcon);
			return this.binaryIcon;
		}
		
		return null;
	}
}

module.exports = IconTables;
