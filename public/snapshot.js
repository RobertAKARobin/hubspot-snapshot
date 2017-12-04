'use strict';

Components.snapshot = function(){

	var Deals = [];
	var DealsFiltered = [];
	var DealProperties = [];
	var DealPropertiesByName = {};
	var DealCalculations = {};
	var DefaultDealProperties = ['dealname', 'createdate', 'dealstage'];
	var RequestedDealProperties = [];
	var HubspotPortalID = null;

	var Query = {
		properties: (Location.query().properties ? Location.query().properties.split(',') : []),
		limitToFirst: (Location.query().limitToFirst || false),
		includeHistory: (Location.query().includeHistory || false)
	}

	var state = {
		propertiesLoadingStatus: 0,
		dealsLoadingStatus: 0,
		sortProperty: false,
		sortDirection: false,
		filterError: false
	}

	var addPropertyToQueryString = function(event){
		var property = this;
		Query.properties._addIfDoesNotInclude(property.name);
		updateQueryString();
	}
	var removePropertyFromQueryString = function(event){
		var property = this;
		Query.properties._remove(property.name);
		updateQueryString();
	}
	var updateQueryString = function(){
		var qs = {};
		for(var propertyName in Query){
			if(Query[propertyName]){
				qs[propertyName] = Query[propertyName];
			}
		}
		qs.properties = Query.properties.join(',');
		Location.query(qs, true);
	}
	var applyFilter = function(filterString){
		var quotes = [];
		filterString = (filterString || '');
		filterString = filterString
			.replace(/(".*?[^\\]"|'.*?[^\\]')/g, function(match){
				quotes.push(match);
				return '%%%%';
			})
			.replace(/\$/g, 'deal.')
			.replace(/alert\(.*?\)|confirm\(.*?\)|prompt\(.*?\)/g, '')
			.replace(/\bAND\b/gi, '&&')
			.replace(/\bOR\b/gi, '||')
			.replace(/\bNOT\s+/gi, '!')
			.replace(/\s+HAS\s+(%%%%)/gi, '.indexOf(%%%%) > -1')
			.replace(/([^<>])(=+)/g, function(nil, modifier, equalses){
				return modifier + (equalses.length == 1 ? '==' : equalses);
			})
			.replace(/≠/g, '!=')
			.replace(/≥/g, '>=')
			.replace(/≤/g, '<=')
			.replace(/%%%%/g, function(){
				return quotes.shift();
			});
		console.log(filterString)
		try{
			var filterFunction  = new Function('deal', 'return ' + (filterString || 'true'));
			DealsFiltered = Deals.filter(filterFunction);
			DealCalculations = {};
			RequestedDealProperties.forEach(function(propertyName){
				var property = DealPropertiesByName[propertyName];
				if(property.type == 'number' || property.type == 'currency'){
					DealCalculations[propertyName] = DealsFiltered.reduce(sumDealsBy(property.name), 0);
				}
			});
		}catch(e){
			state.filterError = true;
			return false;
		}
	}
	var sortOnColumn = function(event){
		var property = this;
		state.sortProperty = property.name;
		state.sortDirection = (state.sortDirection == 'asc' ? 'desc' : 'asc');

		var fieldType = DealPropertiesByName[state.sortProperty].type;
		DealsFiltered._sortOn(function(deal){
			var value = deal[state.sortProperty];
			if(fieldType == 'number' || fieldType == 'currency'){
				return parseFloat(value || 0);
			}else if(value){
				return (value || '').toString().toLowerCase().replace(/[^a-zA-Z0-9]/g,'');
			}
		});
		if(state.sortDirection == 'asc'){
			DealsFiltered.reverse();
		}
	}
	var formatDealProperties = function(deal){
		RequestedDealProperties.forEach(formatDealProperty.bind(deal));
	}
	var formatDealProperty = function(propertyName){
		var deal = this;
		var value = deal[propertyName];
		switch(DealPropertiesByName[propertyName].type){
			case 'datetime':
				value = (new Date(parseInt(value)))._toPrettyString();
				break;
			case 'currency':
				value = (parseFloat(value) || 0).toFixed(2);
				break;
			case 'number':
				value = (parseFloat(value) || 0);
				break;
		}
		deal[propertyName] = value;
	}
	var sumDealsBy = function(propertyName){
		return function(sum, deal){
			return sum + parseFloat(deal[propertyName]);
		}
	}

	var views = {
		input: function(stream){
			return {
				value: stream(),
				oninput: function(event){
					event.redraw = false;
					stream(event.target.value);
					updateQuerystring();
				}
			}
		},
		checkbox: function(stream){
			return [
				m('input[type=checkbox]', {
					checked: stream(),
					onchange: function(event){
						var currentStreamValue = stream();
						stream(!currentStreamValue);
						updateQuerystring();
					}
				}),
				m('span')
			]
		},
		properties: function(){
			return [
				m('p', "Select properties:"),
				m('div.select', [
					m('table', [
						DealProperties.map(function(property){
							return m('tr', [
								m('td', {
									'data-isHidden': (DefaultDealProperties.includes(property.name) || Query.properties.includes(property.name)),
									onclick: addPropertyToQueryString.bind(property),
									title: property.name
								}, [
									property.label,
									m('span.paren', property.name)
								])
							])
						})
					])
				]),
				m('p', "De-select properties:"),
				m('div.select', [
					m('table', [
						DefaultDealProperties.concat(Query.properties).map(function(propertyName){
							var isDefaultDealProperty = DefaultDealProperties.includes(propertyName);
							var property = DealPropertiesByName[propertyName];
							if(property){
								return m('tr', [
									m('td', {
										'data-disabled': isDefaultDealProperty,
										title: property.name,
										onclick: (isDefaultDealProperty ? null : removePropertyFromQueryString.bind(property))
									}, [
										property.label,
										m('span.paren', property.name)
									])
								])
							}
						})
					])
				])
			]
		},
		sidebar: function(){
			return m('div.controls', [
				views.properties(),
				m('button', {
					onclick: function(event){
						var qs = JSON.parse(JSON.stringify(Location.query()));
						qs.properties = DefaultDealProperties.concat(qs.properties).join(',');
						state.dealsLoadingStatus = 1;
						Deals = [];
						m.request({
							method: 'GET',
							url: './deals/snapshot',
							data: qs
						}).then(function(response){
							HubspotPortalID = response.hubspotPortalID;
							RequestedDealProperties = Object.keys(response.requestedProperties);
							Deals = Object.values(response.deals);
							Deals.forEach(formatDealProperties);
							applyFilter();
							state.dealsLoadingStatus = 2;
						});
					}
				}, 'Load')
			])
		},
		deals: function(){
			return [
				m('table.dealHeaders', [
					m('thead.dealHeaderColumns', [
						views.dealHeaders(true),
						(Object.keys(DealCalculations).length > 0 ? views.dealCalculations() : null),
						m('tr', [
							m('td', {
								colspan: (RequestedDealProperties.length + 1)
							}, [
								m('input', {
									placeholder: 'Enter filter',
									hasError: !!(state.filterError),
									oninput: function(){
										state.filterError = false;
									},
									onkeyup: function(event){
										var isReturn = (event.keyCode == 13);
										if(isReturn){
											event.preventDefault();
											applyFilter(event.target.value);
										}
									}
								})
							])
						])
					])
				]),
				m('table.dealRows', [
					m('thead.dealHeaderColumnsDummy', [
						views.dealHeaders()
					]),
					m('tbody', [
						DealsFiltered.map(views.dealRow)
					])
				])
			]
		},
		dealHeaders: function(isClickable){
			return m('tr', [
				m('th', {
					title: 'dealId'
				}, '#'),
				RequestedDealProperties.map(function(propertyName){
					var property = DealPropertiesByName[propertyName];
					return m('th', {
						title: property.name,
						'data-propertyType': property.type,
						'data-sortProperty': property.name,
						'data-enabled': !!(isClickable),
						'data-sortDirection': (state.sortProperty == property.name ? state.sortDirection : false),
						onclick: (isClickable ? sortOnColumn.bind(property) : false)
					}, property.label)
				})
			])
		},
		dealCalculations: function(){
			return m('tr.subheader', [
				m('td'),
				RequestedDealProperties.map(function(propertyName){
					var property = DealPropertiesByName[propertyName];
					var value = DealCalculations[property.name];
					if(value){
						if(property.type == 'currency'){
							value = value.toFixed(2);
						}
					}
					return m('td', {
						'data-propertyType': property.type
					}, value);
				})
			])
		},
		dealRow: function(deal, dealIndex){
			return m('tr', [
				m('td', [
					m('a', {
						title: 'dealId',
						href: 'https://app.hubspot.com/sales/' + HubspotPortalID + '/deal/' + deal.dealId
					}, DealsFiltered.length - dealIndex)
				]),
				RequestedDealProperties.map(views.dealColumn.bind(deal))
			])
		},
		dealColumn: function(propertyName){
			var deal = this;
			var property = DealPropertiesByName[propertyName];
			return m('td', {
				'data-propertyType': property.type,
			}, deal[property.name]);
		}
	}

	return {
		oninit: function(){
			state.propertiesLoadingStatus = 0;
			m.request({
				method: 'GET',
				url: './deals/properties'
			}).then(function(response){
				if(response.statusCode == 401){
					location.href = "/authorize/reset";
				}else{
					DealPropertiesByName = response;
					DealProperties = Object.values(DealPropertiesByName)._sortOn(function(item){
						return (item.label || item.name);
					});
					state.propertiesLoadingStatus = 2;
				}
			});
		},
		onupdate: function(){
			var hiddenDealHeaders = document.querySelectorAll('.dealHeaderColumnsDummy th');
			var dealHeaders = document.querySelectorAll('.dealHeaderColumns th');
			for(var i = 0; i < hiddenDealHeaders.length; i++){
				dealHeaders[i].style.width = hiddenDealHeaders[i].clientWidth + 'px';
			}
		},
		view: function(){
			return m('div.wrap', [
				m('div.sidebar', [
					m('h1', 'Hubspot Deals'),
					(
						state.propertiesLoadingStatus == 2
						? views.sidebar()
						: m('p', 'Loading...')
					)
				]),
				m('div.body', [
					(
						state.dealsLoadingStatus == 2
						? views.deals()
						: m('div.dealLoadStatus',
							state.dealsLoadingStatus == 1
							? m('p', 'Loading...')
							: m('p', 'No deals loaded.')
						)
					)
				])
			])
		}
	}

}
