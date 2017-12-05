'use strict';

var DealsView = (function(){
	var views = {
		filterRow: function(){
			return m('tr.filterRow', [
				m('td', {
					colspan: Object.keys(Deals.propertiesRequested).length + 1
				}, [
					m('div.tableOptions', [
						m('div', [
							'Showing ' + Deals.allFiltered.length + ' of ' + Deals.all.length + '. ',
							m('a', {
								'data-hasTooltip': true
							}, 'Filter on:'),
							m('span.tooltip', [
								"Filters are case-sensitive.",
								"Each property must begin with $.",
								"Math operators are >, <, =, ≠, ≥, and ≤.",
								"Logical operators are AND, OR, and NOT.",
								"Use HAS to filter on text that contains other text.",
								"Wrap everything but integers in 'quotes.'",
								"",
								"For example:",
								"$dealname = 'Business Company Inc.'",
								"$dealname has 'Business' or $dealname has 'Company'",
								"$createdate ≥ '14/12/01' and $createdate ≤ '14/12/31'",
								"$amount ≠ 0",
								"$amount = 1000",
								"$amount > 5000 and not ($dealstage = 'Lost')"
							].join('\n'))
						]),
						m('input', {
							id: 'filter',
							value: state.enteredFilter,
							placeholder: 'Enter filter...',
							hasError: !!(state.filterError),
							spellcheck: false,
							onkeyup: function(event){
								var isReturn = (event.keyCode == 13);
								var filterString = event.target.value;
								state.filterError = false;
								state.enteredFilter = filterString;
								if(isReturn){
									event.preventDefault();
									try{
										Deals.filter(filterString);
										Query.filter = filterString;
										updateQueryString();
									}catch(e){
										state.filterError = true;
									}
								}
							}
						})
					])
				])
			])
		},
		headerTitlesRow: function(isClickable){
			return m('tr.headerRow', [
				m('th', {
					title: 'dealId'
				}, '#'),
				Object.values(Deals.propertiesRequested).map(function(property){
					return m('th', {
						title: property.name,
						'data-propertyType': property.type,
						'data-sortProperty': property.name,
						'data-enabled': !!(isClickable),
						'data-sortDirection': (state.sortProperty == property.name ? state.sortDirection : false),
						onclick: (isClickable ? function(event){
							state.sortProperty = property.name;
							state.sortDirection = (state.sortDirection == 'asc' ? 'desc' : 'asc');
							Deals.sort(property);
							if(state.sortDirection == 'asc'){
								Deals.allFiltered.reverse();
							}
						 } : false)
					}, [
						m('span.title', property.label),
						(
							property.type == 'number' || property.type == 'currency'
							? m('span.sum',
								(
									property.type == 'currency'
									? Deals.calculations[property.name].sum._toDollars()
									: Deals.calculations[property.name].sum.toString()
								)
							)
							: null
						)
					])
				})
			])
		},
		dataRow: function(deal, dealIndex){
			return m('tr.dataRow', [
				m('td', [
					m('a.idlink', {
						title: 'dealId',
						href: 'https://app.hubspot.com/sales/' + HubspotPortalID + '/deal/' + deal.dealId
					}, dealIndex + 1)
				]),
				Object.values(Deals.propertiesRequested).map(views.dataColumn.bind(deal))
			])
		},
		dataColumn: function(property){
			var deal = this;
			var value = deal[property.name];
			switch(property.type){
				case 'currency':
					value = (parseFloat(value) || 0)._toDollars();
					break;
				case 'number':
					value = (parseFloat(value) || 0).toString();
					break;
			}
			return m('td', {
				'data-propertyType': property.type,
			}, value);
		},
		Main: function(){
			return [
				m('table.dealHeaders', [
					views.headerTitlesRow('clickable'),
					views.filterRow()
				]),
				m('table.dealData', [
					views.headerTitlesRow(),
					Deals.allFiltered.map(views.dataRow)
				])
			]
		}
	}

	var statusMessages = {
		0: 'No deals loaded.',
		1: 'Loading...',
		2: 'Success!',
		3: [
			'The Hubspot server broke. Get a cup of coffee and then try again. Keep an eye on ',
			m('a', {
				href: 'https://status.hubspot.com'
			}, 'status.hubspot.com')
		]
	}

	return {
		onupdate: function(){
			var hiddenDealHeaders = document.querySelectorAll('.dealData .headerRow th');
			var dealHeaders = document.querySelectorAll('.dealHeaders .headerRow th');
			for(var i = 0; i < hiddenDealHeaders.length; i++){
				dealHeaders[i].style.width = hiddenDealHeaders[i].clientWidth + 'px';
			}
		},
		view: function(){
			if(state.dealsLoadingStatus == 2){
				return views.Main();
			}else{
				return m('div.dealLoadStatus', statusMessages[state.dealsLoadingStatus]);
			}
		}
	}
})();
