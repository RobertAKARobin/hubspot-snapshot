'use strict';

var express = require('express');
var bodyParser = require('body-parser');
var http = require('http');
var cookieParser = require('cookie-parser');
var path = require('path');

var HS = {
	authorize: require('./hs.auth'),
	api: require('./hs.api')
}
require('./public/helpers');

if(process.env['NODE_ENV'] != 'production'){
	require('dotenv').config();
	process.env.PORT = 3000;
	process.env['NODE_ENV'] = 'development';
	console.log('Dev environment');
}

var httpServer = express();
var baseServer = http.createServer(httpServer);
var DealProperties = undefined;
var DealStages = undefined;

baseServer
	.listen(process.env.PORT, function(){
		console.log(Date().toLocaleString())
	});

httpServer
	.use(cookieParser())
	.use(bodyParser.json())
	.get('/authorize', HS.authorize.init)
	.get('/authorize/redirect', HS.authorize.redirect)
	.get('/authorize/reset', HS.authorize.reset)
	.get('*', function(req, res, next){
		if(process.env['NODE_ENV'] == 'development' || req.cookies['access_token']){
			next();
		}else{
			return res.redirect('/authorize');
		}
	})
	.get('/deals/properties',
		HS.api.properties.get,
		HS.api.properties.handle
	)
	.get('/deals/snapshot\.:format?', function(req, res){
		var Today = (new Date()).toArray();
		var snapshotDate = new Date(
			(parseInt(req.query.year) || Today[0]),
			(parseInt(req.query.month) || Today[1]),
			(parseInt(req.query.day) || Today[2])
		);
		var year = (parseInt(req.query.year) || Today[0]);

		var properties = (req.query.properties || '').trim();
		properties = (properties ? properties.split(',') : []);
		properties
			.addIfDoesNotInclude('createdate')
			.addIfDoesNotInclude('dealname');
		var offset = 0;
		var outputDeals = [];
		var numDealsTotal = 0;
		var numPages = 0;
		var numPerPage = 250;

		try{
			properties.forEach(function(propertyName){
				if(Object.keys(DealProperties).includes(propertyName) == false){
					throw propertyName;
				}
			});
		}catch(propertyName){
			return res.json({
				success: false,
				message: 'Property "' + propertyName + '" does not exist.'
			});
		}
		loadMoreDeals();

		function onComplete(){
			properties.unshift('dealId');
			if(req.params.format == 'tsv'){
				var output = [];
				var csvString;
				var dIndex, deal, pIndex, propertyName, propertyValue, propertyType;
				var delim = '\t';
				var filename = 'deals_snapshot_' + snapshotDate.toArray().join('-') + '.tsv';
				output.push(properties.join(delim));
				for(dIndex = 0; dIndex < outputDeals.length; dIndex += 1){
					deal = [];
					for(pIndex = 0; pIndex < properties.length; pIndex += 1){
						propertyName = properties[pIndex];
						propertyValue = outputDeals[dIndex][propertyName];
						propertyType = DealProperties[propertyName].type;
						if(propertyValue){
							if(propertyName == 'dealstage'){
								propertyValue = DealStages[propertyValue];
							}else if(propertyType == 'date' || propertyType == 'datetime'){
								propertyValue = (new Date(parseInt(propertyValue))).toArray().join('-');
							}else if(propertyType == 'string'){
								propertyValue = propertyValue.replace('\t', ' ');
							}
						}
						deal.push(propertyValue);
					}
					output.push(deal.join(delim));
				}
				csvString = output.join('\n');
				res.set('Content-Type', 'text/tab-separated-values');
				res.set('Content-Disposition', 'attachment; filename=' + filename);
				res.send(csvString);
			}else{
				res.json({
					snapshotDate: snapshotDate,
					properties: properties,
					numPages: numPages,
					numPerPage: numPerPage,
					numDealsTotal: numDealsTotal,
					deals: outputDeals,
					numDealsOutput: outputDeals.length
				});
			}
		}

		function loadMoreDeals(){
			HubAPIRequest(req, {
				method: 'GET',
				url: 'https://api.hubapi.com/deals/v1/deal/paged',
				qsStringifyOptions: {
					arrayFormat: 'repeat'
				},
				qs: {
					limit: numPerPage,
					offset: offset,
					properties: properties,
					propertiesWithHistory: true
				}
			}, function(apiResponse){
				if(!apiResponse.success){
					return res.redirect('/authorize/reset');
				}else{
					numPages += 1;
					numDealsTotal += apiResponse.body.deals.length;
					apiResponse.body.deals.forEach(appendDeal);
					if(apiResponse.body.hasMore && !(req.query.limitToFirst)){
						offset = apiResponse.body.offset;
						loadMoreDeals();
					}else{
						onComplete();
					}
				}
			});
		}

		function appendDeal(deal){
			var pIndex, propertyName, propertyType, versions, vIndex, version;
			var output = {};
			if(deal.properties.createdate.value > snapshotDate){
				return;
			}
			for(pIndex = 0; pIndex < properties.length; pIndex++){
				propertyName = properties[pIndex];
				propertyType = DealProperties[propertyName];

				if(!deal.properties[propertyName]){
					output[propertyName] = '';
				}else{
					versions = deal.properties[propertyName].versions;
					for(vIndex = 0; vIndex < versions.length; vIndex++){
						version = versions[vIndex];
						if(version.timestamp <= snapshotDate){
							output[propertyName] = version.value;
							break;
						}
					}
				}
			}
			output.dealId = deal.dealId;
			outputDeals.push(output);
		}
	})
	.use('/', express.static('./public'));

function HubAPIRequest(req, params, callback){
	if(process.env['NODE_ENV'] == 'development'){
		params.qs = (params.qs || {})
		params.qs['hapikey'] = process.env['HAPIKEY'];
	}else if(process.env['NODE_ENV'] == 'production'){
		params.headers = (params.headers || {});
		params.headers['Authorization'] = 'Bearer ' + req.cookies['access_token'];
	}
	console.log(params);
	request(params, function(error, response, body){
		var result = {
			success: true,
			statusCode: response.statusCode
		};
		console.log(response.statusCode);
		if(error || result.statusCode >= 400){
			result.success = false;
		}
		try{
			result.body = JSON.parse(body || '{}');
		}catch(e){
			result.body = (error || body);
		}
		callback(result);
	});
}
