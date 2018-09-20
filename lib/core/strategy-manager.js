"use strict";

const MappedDisposable = require("mapped-disposable");
const {EntityType, FileSystem} = require("atom-fs");


class StrategyManager{
	
	constructor(){
		this.isReady = false;
		this.fileStrategies = [];
		this.directoryStrategies = [];
		this.disposables = new MappedDisposable();
		
		this.loadPromise = this.loadStrategies([
			"./strategies/signature-strategy.js",
			"./strategies/hashbang-strategy.js",
			"./strategies/modeline-strategy.js",
			"./strategies/linguist-strategy.js",
			"./strategies/usertype-strategy.js",
			"./strategies/grammar-strategy.js",
			"./strategies/path-strategy.js",
		]);
	}
	
	
	destroy(){
		if(!this.destroyed){
			this.destroyed = true;
			this.disposables.dispose();
			this.disposables = null;
		}
	}
	
	
	async loadStrategies(paths){
		if(this.destroyed) return;
		
		await Promise.all(
			paths.map(path => this.loadStrategy(path))
		);
		
		// Sort strategy lists
		this.fileStrategies = this.fileStrategies.filter(Boolean).reverse();
		this.directoryStrategies = this.directoryStrategies.filter(Boolean).reverse();
		this.isReady = true;
	}
	
	
	loadStrategy(path){
		if(this.destroyed) return;
		
		const strategy = new (require(path));
		const {priority, name} = strategy;
		
		if(strategy.matchesFiles)
			this.fileStrategies[priority] = strategy;
		
		if(strategy.matchesDirs)
			this.directoryStrategies[priority] = strategy;
		
		if(!strategy.noSetting){
			const observer = atom.config.observe(name, enabled => {
				enabled ? strategy.enable() : strategy.disable();
			});
			this.disposables.add(name, observer);
		}
		// Strategies without settings are always active
		else strategy.enable();
	}
	
	
	query(resource){
		if(null == resource)
			return;
		
		const strategies = resource.isDirectory
			? this.directoryStrategies
			: this.fileStrategies;
		
		if(!strategies) return;
		for(const strategy of strategies){
			if(!strategy.enabled) continue;
			const shouldStop = strategy.check(resource);
			if(shouldStop)
				break;
		}
	}
}

module.exports = StrategyManager;
