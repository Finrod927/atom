"use strict";

const {CompositeDisposable} = require("atom");
const FileIcons = require("../main.js");


class IconNode{
	
	constructor(resource, element, tabIcon = false){
		const delegate = resource.icon;
		
		this.disposables = new CompositeDisposable();
		this.resource = resource;
		this.element = element;
		this.visible = true;
		this.classes = null;
		this.appliedClasses = null;
		FileIcons.iconsByElement.set(element, this);

		// HACK(#698): This. Shouldn't. Happen.
		if(null == delegate)
			return this.destroy();
		
		this.disposables.add(
			FileIcons.ui.onMotifChanged(() => this.refresh()),
			atom.config.onDidChange("file-icons.coloured", () => this.refresh()),
			atom.config.onDidChange("file-icons.colourChangedOnly", () => this.refresh()),
			delegate.onDidChangeIcon(() => this.refresh()),
			resource.onDidDestroy(() => this.destroy()),
			resource.onDidChangeVCSStatus(() => {
				if(atom.config.get("file-icons.colourChangedOnly"))
					this.refresh();
			})
		);
		
		if(tabIcon){
			this.disposables.add(
				atom.config.onDidChange("file-icons.tabPaneIcon", show => {
					this.setVisible(show);
				})
			);
			this.setVisible(atom.config.get("file-icons.tabPaneIcon"));
		}
		
		if(resource.isFile)
			this.disposables.add(
				atom.config.onDidChange("file-icons.defaultIconClass", () => this.refresh())
			);
		
		else if(delegate.getCurrentIcon())
			element.classList.remove(...delegate.getFallbackClasses());
		
		this.refresh();
	}
	
	
	destroy(){
		if(!this.destroyed){
			this.disposables.dispose();
			FileIcons.iconsByElement.delete(this.element);
			this.appliedClasses = null;
			this.classes   = null;
			this.resource  = null;
			this.element   = null;
			this.destroyed = true;
		}
	}
	
	
	refresh(){
		if(!this.visible){
			this.removeClasses();
			this.classes = null;
		}
		else{
			const classes = this.resource.icon.getClasses();
			if(this.classesDiffer(classes, this.classes)){
				this.removeClasses();
				this.classes = classes;
				this.addClasses();
			}
		}
	}
	
	
	setVisible(input){
		input = !!input;
		if(input !== this.visible){
			this.visible = input;
			this.refresh();
		}
	}
	
	
	/**
	 * Apply the current icon-classes to the instance's element.
	 *
	 * @private
	 */
	addClasses(){
		if(!this.visible) return;
		
		if(this.classes){
			this.appliedClasses = this.classes;
			this.element.classList.add(...this.appliedClasses);
		}
	}
	
	
	/**
	 * Remove previously-applied classes.
	 *
	 * @private
	 */
	removeClasses(){
		if(null !== this.appliedClasses){
			this.element.classList.remove(...this.appliedClasses);
			this.appliedClasses = null;
		}
	}
	
	
	/**
	 * Determine if two icon-class lists differ.
	 *
	 * @param {Array} a
	 * @param {Array} b
	 * @return {Boolean}
	 * @private
	 */
	classesDiffer(a, b){
		return (a && b)
			? !(a[0] === b[0] && a[1] === b[1])
			: true;
	}
}


IconNode.prototype.destroyed = false;
module.exports = IconNode;
