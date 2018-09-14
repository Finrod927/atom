"use strict";

const MappedDisposable         = require("mapped-disposable");
const {Disposable, Emitter}    = require("atom");
const {EntityType, FileSystem} = require("atom-fs");

// Constants indicating each stage of the package's activation process
const DEACTIVATED        = 0b00000000;
const DEACTIVATING       = 0b00000001;
const ACTIVATING         = 0b00000010;
const LOADED_CACHE       = 0b00000100;
const LOADED_OPTIONS     = 0b00001000;
const LOADED_UI          = 0b00010000;
const LOADED_ICONS       = 0b00100000;
const LOADED_STRATEGIES  = 0b01000000;
const ACTIVATED          = 0b10000000;


const FileIcons = {
	disposables: null,
	loadState:   DEACTIVATED,


	/**
	 * Activate and initialise package.
	 *
	 * @param {Object} [state] - Data serialised from previous session
	 * @return {Promise}
	 * @internal
	 */
	async activate(state){
		global._FileIcons    = this;
		this.loadState       = ACTIVATING;
		this.disposables     = new MappedDisposable();
		this.emitter         = new Emitter();
		this.iconsByElement  = new Map();
		this.iconDisposables = new Map();
		
		await this.setupStorage(state);
		await this.setupStrategies();
		await Promise.all([
			this.setupCommands(),
			this.setupOptions(),
			this.setupUI(),
		]);
		
		this.loadState = ACTIVATED;
	},


	/**
	 * Free up memory when deactivating.
	 * @internal
	 */
	deactivate(){
		this.loadState |= DEACTIVATING;
		this.storage.locked = true;
		
		this.disposables.dispose();
		this.disposables = null;
		this.emitter.emit("did-destroy");
		this.emitter.dispose();
		this.emitter = null;
		
		this.loadState = DEACTIVATED;
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
	 * Create and apply an {@link IconNode} to a DOM element the package has
	 * no control over. This method ensures icon elements created by consumers
	 * continue to display accurate icons even when matches change.
	 *
	 * @public
	 * @returns {Disposable}
	 *    A Disposable that destroys the {IconNode} when disposed of. Authors
	 *    are encouraged to do so once the element is no longer needed.
	 * 
	 * @param {HTMLElement} element
	 *    DOM element receiving the icon-classes. It must reference a real
	 *    element, not a jQuery object or so-called "virtual DOM" node.
	 *
	 * @param {String} path
	 *    Absolute filesystem path. Non-existent or remote resources are assumed to
	 *    be regular files. Use the `typeHints` parameter to provide additional data
	 *    if the resource cannot be accessed from the local filesystem.
	 *
	 * @param {Object} [typeHints={}]
	 *    Supplementary data provided by consumers to improve the API's accuracy.
	 *    Use this parameter if a file or directory exists remotely (such as a network
	 *    share) or hypothetically (such as a file inside a compressed archive).
	 *
	 * @param {Boolean} [typeHints.isDirectory=false]
	 *    Indicate that `path` points to a directory, not a regular file.
	 *
	 * @param {Boolean} [typeHints.isSymlink=false]
	 *    Indicate that `path` points to a symbolic link (assumed to be a file-type
	 *    link unless `typeHints.isDirectory` is specified).
	 *
	 * @param {Boolean} [typeHints.isTabIcon=false]
	 *    Whether to hide the icon when disabling the package's `Show icons in file tabs`
	 *    setting. This is used by Atom's `tabs` package, but can theoretically be used
	 *    by any package which adds a similar-looking tabbed component.
	 */
	addIconToElement(element, path, typeHints = {}){
		let disposable = null;
		
		let type = typeHints.isDirectory
			? EntityType.DIRECTORY
			: EntityType.FILE;
		
		if(typeHints.isSymlink)
			type |= EntityType.SYMLINK;
		
		if(element){
			const icon = this.iconsByElement.get(element);
			
			// Reuse an existing disposable that's not been disposed of yet
			if(icon && !icon.destroyed && iconDisposables.has(icon))
				disposable = this.iconDisposables.get(icon);
			
			// Invalid input: don't break the user's workflow, but do emit an error message
			else if(!path || !(element instanceof HTMLElement)){
				console.error(path ? "Invalid element passed" : "Empty path provided");
				disposable = new Disposable();
			}
			
			else{
				const rsrc = FileSystem.get(path, false, type);
				const node = new IconNode(rsrc, element, typeHints.isTabIcon);
				disposable = new Disposable(() => {
					iconDisposables.delete(node);
					node.removeClasses();
					node.destroy();
				});
				this.iconDisposables.set(node, disposable);
			}
		}
		if(null !== FileIcons.disposables)
			FileIcons.disposables.add(disposable);
		return disposable;
	},
	
	
	/**
	 * Retrieve a previously-created {@link IconNode} for a DOM element.
	 *
	 * @param {HTMLElement} element
	 * @return {IconNode}
	 * @internal
	 */
	getIcon(element){
		return element
			? this.iconsByElement.get(element) || null
			: null;
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
	 * Register a package command in Atom.
	 *
	 * @example FileIcons.registerCommand("toggle-colours", () => …);
	 * @param {String} name - Name without prefixed namespace
	 * @param {Function} fn - Handler function
	 * @return {Disposable}
	 * @internal
	 */
	registerCommand(name, fn){
		name = `file-icons:${name}`;
		const cmd = atom.commands.add("atom-workspace", name, fn);
		this.disposables.add("commands", cmd);
		return cmd;
	},
	
	
	/**
	 * Register a package setting in Atom.
	 *
	 * The value of a registered setting is stored on the FileIcons package object
	 * with the given `property` name, which defaults to the setting's name if omitted.
	 * An optional third parameter may be given to modify what gets stored, which
	 * is usually desirable for strings that need to be split into arrays.
	 *
	 * @param {String}     option - Name of setting, as defined by package.json.
	 * @param {String} [property] - Name of setting's property, if different.
	 * @param {Function} [filter] - Filter to modify the setting's stored value.
	 * @return {Disposable}
	 * @internal
	 */
	registerSetting(option, property = null, filter = null){
		const propertyName = property || option.replace(/^\w+\./, "");
		
		const observer = atom.config.observe(`file-icons.${option}`, value => {
			if(filter) value = filter(value);
			this[propertyName] = value;
			this.emitter.emit("did-change-" + propertyName, value);
		});
		
		this.disposables.add("options", observer);
		return observer;
	},
	
	
	/**
	 * Wipe all cached data.
	 *
	 * @return {Notification}
	 * @public
	 */
	resetCache(){
		if(this.storage.locked)
			return atom.notifications.addError("Storage locked", {
				detail: "This shouldn't have happened. Please restart Atom.",
				dismissable: true,
			});

		else{
			const {constructor:Storage, size} = this.storage;
			this.data.paths.reset();
			this.data = new Storage();
			atom.project.serialize();
			
			const plural = 1 === size ? "" : "s";
			const message = `Cleared ${size} path${plural} from icon cache.`;
			return atom.notifications.addInfo(message, {dismissable: true});
		}
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
		this.disposables.add("storage", new Disposable(() => {
			this.storage.destroy();
			this.storage = null;
		}));
		this.readyState |= LOADED_CACHE;
	},
	
	
	/**
	 * Initialise {@link StrategyManager} and unpack icon tables.
	 * @internal
	 */
	async setupStrategies(){
		const StrategyManager = require("./service/strategy-manager.js");
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
		
		this.readyState |= LOADED_STRATEGIES;
	},
	
	
	/**
	 * Register all relevant package options.
	 * @internal
	 */
	async setupOptions(){
		this.registerSetting("coloured");
		this.registerSetting("onChanges", "colourChangedOnly");
		this.registerSetting("defaultIconClass", null, value => value.split(/\s+/));
		this.registerSetting("tabPaneIcon");
		this.registerSetting("strategies.grammar");
		this.registerSetting("strategies.hashbangs");
		this.registerSetting("strategies.modelines");
		this.registerSetting("strategies.usertypes");
		this.registerSetting("strategies.linguist");
		this.registerSetting("strategies.signature");
		this.disposables.add("options", this.observe("coloured", enabled => {
			const classes = document.body.classList;
			classes.toggle("file-icons-colourless", !enabled);
			classes.toggle("file-icons-coloured",    enabled);
		}));
		this.readyState |= LOADED_OPTIONS;
	},
	
	
	/**
	 * Register package commands with Atom's APIs.
	 * @internal
	 */
	async setupCommands(){
		this.registerCommand("clear-cache",         () => this.resetCache());
		this.registerCommand("toggle-colours",      () => this.toggleSetting("coloured"));
		this.registerCommand("toggle-changed-only", () => this.toggleSetting("colourChangedOnly"));
		this.registerCommand("toggle-tab-icons",    () => this.toggleSetting("tabPaneIcon"));
	},
	
	
	/**
	 * Setup workspace and DOM-related event handlers.
	 * @internal
	 */
	async setupUI(){
		const UI = require("./ui.js");
		this.ui = new UI();
		this.readyState |= LOADED_UI;
	},
	
	
	/**
	 * Toggle the status of a package setting. Implies a boolean type.
	 *
	 * @param {String} name
	 * @return {Boolean} Whether an option was changed.
	 */
	toggleSetting(name){
		name = `file-icons.${name}`;
		return atom.config.set(name, !(atom.config.get(name)));
	},
};

module.exports = FileIcons;
