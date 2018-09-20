"use strict";

const HeaderStrategy = require("./header-strategy.js");
const FileIcons = require("../../main.js");


class HashbangStrategy extends HeaderStrategy {
	
	constructor(){
		super({
			name: "hashbangs",
			priority: 5
		});
	}
	
	
	matchIcon(resource){
		const pattern = /^#!(?:(?:\s*\S*\/|\s*(?=perl6?))(\S+))(?:(?:\s+\S+=\S*)*\s+(\S+))?/;
		const tokens = null !== resource.data
			? this.getFirstLine(resource.data).match(pattern)
			: null;
		
		if(!tokens)
			return null;
		
		const name = "env" === tokens[1]
			? (tokens[2] || "").split("/").pop()
			:  tokens[1];
		
		// TypeScript source which compiles an executable Node file (#606)
		if("node" === name && /\.tsx?$/i.test(resource.name))
			return null;
		
		let result = FileIcons.iconTables.matchInterpreter(name);
		
		// Valid hashbang, unrecognised interpreter
		if(!result){
			const {executable} = resource;
			const {executableIcon} = FileIcons.iconTables;
			
			// Stats currently unavailable
			if(null === executable){
				const onStats = resource.onDidLoadStats(() => {
					onStats.dispose();
					if(resource.executable)
						resource.icon.add(executableIcon, this.priority);
				});
			}
			
			else if(executable)
				result = executableIcon;
		}
		
		return result || null;
	}
}


module.exports = HashbangStrategy;
