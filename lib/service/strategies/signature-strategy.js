"use strict";

const HeaderStrategy = require("./header-strategy.js");
const FileIcons = require("../../main.js");


class SignatureStrategy extends HeaderStrategy {
	
	constructor(){
		super({
			name:         "signature",
			priority:     0,
			minScanSize:  1,
			ignoreBinary: false,
		});
	}
	
	
	matchIcon(resource){
		const {data} = resource;
		return data
			? FileIcons.iconTables.matchSignature(data)
			: null;
	}
}


module.exports = SignatureStrategy;
