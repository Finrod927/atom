"use strict";

const MappedDisposable = require("mapped-disposable");
const {EntityType, FileSystem} = require("atom-fs");

// Constants indicating each stage of the package's activation process
const UNREADY        = 0b00000;
const LOADED_CACHE   = 0b00001;
const LOADED_OPTIONS = 0b00010;
const LOADED_UI      = 0b00100;
const LOADED_ICONS   = 0b01000; 
const COMPLETE       = 0b11111;


const FileIcons = {

	/**
	 * Activate and initialise package.
	 *
	 * @param {Object} [state] - Data serialised from previous session
	 * @return {Promise}
	 * @internal
	 */
	async activate(state){
		global._FileIcons = this;
		this.loadState    = UNREADY;
		this.disposables  = new MappedDisposable();
		
		await this.setupStorage(state);
		await Promise.all([
			this.setupStrategies(),
			this.setupOptions(),
			this.setupUI(),
		]);
	},


	/**
	 * Deactivate package and clear up memory.
	 * @internal
	 */
	deactivate(){
		this.storage.locked = true;
		this.service.reset();
		this.ui.reset();
		this.options.reset();
		delete global._FileIcons;
	},


	/**
	 * Return a blob of data to preserve between sessions.
	 * @return {Object}
	 */
	serialize(){
		return this.storage
			? this.storage.serialize()
			: {};
	},


	/**
	 * Assign an icon to a DOM element.
	 *
	 * Top-level method consumed by Atom's services API.
	 *
	 * @public
	 * @return {Disposable} Clears the icon from memory when disposed.
	 * 
	 * @param {HTMLElement} element
	 *    Reference to a DOM element. It must be a real element,
	 *    not a jQuery object or so-called "virtual DOM" node.
	 *
	 * @param {String} path
	 *    File path associated with the element at the time of the node's creation.
	 *    Non-existent or remote resources are assumed to be regular files; use the
	 *    `options` parameter to provide additional data if the resource cannot be
	 *    accessed from the local filesystem.
	 *
	 * @param {Object} [options={}]
	 *    Additional properties used to improve the API's accuracy. Use this when
	 *    adding icons to files and directories that exist remotely (such as a network
	 *    share) or hypothetically (such as the contents of a compressed ZIP archive).
	 *
	 * @param {Boolean} [options.isDirectory=false]
	 *    Indicate that `path` points to a directory, not a regular file.
	 *
	 * @param {Boolean} [options.isSymlink=false]
	 *    Indicate that `path` points to a symbolic link (assumed to be a file-type
	 *    link unless `options.isDirectory` is specified).
	 *
	 * @param {Boolean} [options.isTabIcon=false]
	 *    Whether to hide the icon when disabling the package's `Show icons in file tabs`
	 *    setting. This is used by Atom's `tabs` package, but can theoretically be used
	 *    by any package which adds a similar-looking tabbed component.
	 */
	addIconToElement(element, path, options = {}){
		const {
			isDirectory,
			isSymlink,
			isTabIcon,
		} = options;
		
		let type = isDirectory
			? EntityType.DIRECTORY
			: EntityType.FILE;
		
		if(isSymlink)
			type |= EntityType.SYMLINK;
		
		const disposable = IconNode.forElement(element, path, type, isTabIcon);
		if(null !== FileIcons.disposables)
			FileIcons.disposables.add(disposable);
		return disposable;
	},


	/**
	 * Retrieve a list of CSS classes for a file path.
	 *
	 * @deprecated
	 *    This method is only included for compatibility with older packages.
	 *    Avoid using in new code; it may be removed in a future release.
	 *
	 * @param {String} path
	 * @return {Array}
	 * @public
	 */
	iconClassForPath(path){
		const file = FileSystem.get(path);
		return file && file.icon
			? file.icon.getClasses() || null
			: null;
	},
	
	
	/**
	 * Restore data from a previous workspace session.
	 *
	 * @param {Object} state
	 * @internal
	 */
	async setupStorage(state = null){
		const Storage = require("./storage.js");
		this.storage = new Storage(state);
		this.readyState |= CACHE_LOADED;
	},
	
	
	/**
	 * Initialise {@link StrategyManager} and unpack icon tables.
	 * @internal
	 */
	async setupStrategies(){
		this.strategies = new StrategyManager();
		await this.strategies.loadPromise;
		
		this.disposables.add("service",
			FileSystem.observe(this.strategies.handleResource.bind(this)),
			
			// #693: Notify `FileSystem` when files are deleted
			atom.project.onDidChangeFiles(events => {
				for(const {action, path} of events){
					if("deleted" === action && FileSystem.paths.has(path)){
						const resource = FileSystem.get(path);
						if(resource)
							resource.destroy();
						Storage.deletePath(path);
					}
				}
			}),
		);
	},
	
	
	/**
	 * Register package settings and commands with Atom's APIs.
	 * @internal
	 */
	async setupOptions(){
		const Options = require("./options.js");
		this.options = new Options();
		this.readyState |= OPTIONS_LOADED;
	},
	
	
	/**
	 * Setup workspace and DOM-related event handlers.
	 * @internal
	 */
	async setupUI(){
		const UI = require("./ui.js");
		this.ui = new UI();
		this.readyState |= UI_LOADED;
	}
};

module.exports = FileIcons;
