"use strict";

const {sep}    = require("path");
const AtomFS   = require("atom-fs");
const LRUCache = require("lru-cache");
const isWin    = "\\" === sep;


/**
 * Cache for session-specific data.
 * 
 * @property {Object} data - Pointer to the hash which holds all cached data.
 * @property {Boolean} [locked] - Whether the cache has been locked from modification.
 * @class
 */
class Storage{

	/**
	 * Initialise session storage, optionally with serialised
	 * data from an earlier workspace session.
	 *
	 * @param {Object} [state=null]
	 * @param {Object} [options={}]
	 * @param {Number} [options.maxSize=10000]
	 * @param {Number} [options.version=0x005]
	 * @constructor
	 */
	constructor(state = null, {maxSize = 10000, version = 0x005} = {}){
		this.locked = false;
		this.data = {
			paths: new LRUCache({max: maxSize}),
			version,
		};
		
		// Deserialise data from a previous session
		if(state && version === state.version){
			this.data.paths.load(state.paths);
			this.clean();
		}
	}


	/**
	 * Extract a serialisable copy of currently cached data.
	 *
	 * Routinely called by package's {@link FileIcons.serialize} handler.
	 * Data must be either JSON-compatible or instances of a class that's
	 * registered with Atom's serialisation API.
	 *
	 * @return {Object}
	 * @internal
	 */
	serialise(){
		return {
			paths: this.data.paths.dump(),
			version: this.version,
		};
	}


	/**
	 * Purge cache of invalid or irrelevant data.
	 */
	clean(){
		this.data.paths.forEach((value, path) => {
			if(!this.hasData(path) || !this.isProjectRelated(path))
				this.deletePath(path);
		});
	}



	/**
	 * Determine if a currently-open project encloses a path.
	 *
	 * @param {String} path
	 * @return {Boolean}
	 */
	isProjectRelated(path){
		for(const root of atom.project.rootDirectories){
			const projectPath = root.path;

			if(path === projectPath || 0 === path.indexOf(projectPath + sep))
				return true;

			if(isWin){
				const fixedPath = AtomFS.normalisePath(projectPath);
				if(path === fixedPath || 0 === path.indexOf(fixedPath + "/"))
					return true;
			}
		}
		return false;
	}


	/**
	 * Use path entries when iterating.
	 *
	 * @return {Iterator}
	 */
	[Symbol.iterator](){
		const pathData = this.data.paths;
		const pathKeys = pathData.keys();
		const pathValues = pathData.values();
		const {length} = pathKeys;
		let index = 0;

		return {
			next(){
				if(index >= length)
					return { done: true };
				else{
					const path  = pathKeys[index];
					const value = [path, pathValues[index]];
					++index;
					return { value };
				}
			}
		};
	}


	/**
	 * Create a blank entry for an unlisted path.
	 *
	 * Any existing data is blindly overwritten. Use {@link #getPathEntry}
	 * or {@link #deletePathEntry} to add/delete path-related data.
	 *
	 * @param {String} path
	 * @return {Object}
	 * @internal
	 */
	addPath(path){
		if(this.locked) return;

		const value = {
			icon: null,
			inode: null
		};
		this.data.paths.set(path, value);
		return value;
	}


	/**
	 * Retrieve the data cached for a path.
	 *
	 * A new entry is created if one doesn't exist.
	 *
	 * @param {String} path
	 * @return {Object}
	 */
	getPathEntry(path){
		const entry = this.data.paths.get(path);
		if(entry) return entry;

		return this.locked
			? null
			: this.addPath(path);
	}


	/**
	 * Retrieve the icon data cached for a path.
	 *
	 * @param {String} path
	 * @return {Object}
	 */
	getPathIcon(path){
		const {icon} = this.getPathEntry(path);
		if(!icon) return null;

		return {
			priority:  icon[0],
			index:     icon[1],
			iconClass: icon[2],
		};
	}


	/**
	 * Determine if stored data exists for a given path.
	 *
	 * @param {String} path
	 * @return {Boolean}
	 */
	hasData(path){
		const entry = this.data.paths.get(path) || null;
		return !!(entry && (entry.icon || entry.inode));
	}


	/**
	 * Determine if icon-related data exists for a given path.
	 *
	 * @param {String} path
	 * @return {Boolean}
	 */
	hasIcon(path){
		const entry = this.data.paths.get(path);
		return !!(entry && entry.icon);
	}


	/**
	 * Store icon-related data for a path.
	 *
	 * @param {String} path
	 * @param {Object} iconData
	 * @param {Number} iconData.priority
	 * @param {Number} iconData.index
	 * @param {Array}  iconData.iconClass
	 */
	setPathIcon(path, iconData){
		if(!iconData || this.locked) return;
		this.getPathEntry(path).icon = [
			iconData.priority,
			iconData.index,
			iconData.iconClass,
		];
	}


	/**
	 * Store the inode of a filesystem path.
	 *
	 * @param {String} path
	 * @param {Number} inode
	 */
	setPathInode(path, inode){
		if(!inode || this.locked) return;
		let entry = this.getPathEntry(path);

		// We're holding stale data. Shoot it.
		if(entry.inode && entry.inode !== inode){
			this.deletePath(path);
			entry = this.addPath(path);
		}

		entry.inode = inode;
	}


	/**
	 * Delete any data being stored for a path.
	 *
	 * @param {String} path
	 */
	deletePath(path){
		if(this.locked) return;
		this.data.paths.del(path);
	}


	/**
	 * Delete a path's cached icon.
	 *
	 * @param {String} path
	 */
	deletePathIcon(path){
		if(this.locked) return;
		delete this.getPathEntry(path).icon;
	}


	/**
	 * Number of paths currently cached.
	 *
	 * @property {Number}
	 * @readonly
	 */
	get size(){
		return this.data && this.data.paths
			? this.data.paths.length
			: 0;
	}
}


module.exports = Storage;
