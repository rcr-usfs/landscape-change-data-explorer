
////////////////////////////////////////////////////////////////////////
function runGTAC(){

  //Set up some params
  startYear = parseInt(urlParams.startYear);
  endYear = parseInt(urlParams.endYear);

  analysisMode = urlParams.analysisMode;
  queryClassDict = {};
  var years = range(startYear,endYear+1);
  summaryMethod = urlParams.summaryMethod.toTitle();
  getLCMSVariables();
  
  
  ga('send', 'event', 'lcms-gtac-viewer-run', 'year_range', `${startYear}_${endYear}`);
  ga('send', 'event', 'lcms-gtac-viewer-run', 'analysis_mode', analysisMode);
  ga('send', 'event', 'lcms-gtac-viewer-run', 'timelapse_on', urlParams.addLCMSTimeLapsesOn);
  ga('send', 'event', 'lcms-gtac-viewer-run', 'summary_method', summaryMethod);
  // setupDownloads(studyAreaName);
  var clientBoundary = clientBoundsDict.CONUS_SEAK;
  
  //Bring in assets
  var conusSA = ee.FeatureCollection(studyAreaDict[studyAreaName].conusSA);
  var conusComposites = ee.ImageCollection(studyAreaDict[studyAreaName].conusComposites)//.filter(ee.Filter.calendarRange(startYear,endYear,'year'));
  var conusChange = ee.ImageCollection(studyAreaDict[studyAreaName].conusChange)//.filter(ee.Filter.calendarRange(startYear,endYear,'year'));;
  var conusLC = ee.ImageCollection(studyAreaDict[studyAreaName].conusLC)//.filter(ee.Filter.calendarRange(startYear,endYear,'year'));;
  var conusLU = ee.ImageCollection(studyAreaDict[studyAreaName].conusLU)//.filter(ee.Filter.calendarRange(startYear,endYear,'year'));;
  var conusLT = ee.ImageCollection(studyAreaDict[studyAreaName].conusLT)//.filter(ee.Filter.calendarRange(startYear,endYear,'year'));;
  var conusCCDC = ee.ImageCollection(studyAreaDict[studyAreaName].conusCCDC).filter(ee.Filter.eq('spectral', 'SR'));

  var conusChangeFinal = ee.ImageCollection(studyAreaDict[studyAreaName].conusChangeFinal).filter(ee.Filter.calendarRange(startYear,endYear,'year'));
  var conusLCFinal = ee.ImageCollection(studyAreaDict[studyAreaName].conusLCFinal).filter(ee.Filter.calendarRange(startYear,endYear,'year'));
  var conusLUFinal = ee.ImageCollection(studyAreaDict[studyAreaName].conusLUFinal).filter(ee.Filter.calendarRange(startYear,endYear,'year'));


  var akSA = ee.FeatureCollection(studyAreaDict[studyAreaName].akSA);
  var akComposites = ee.ImageCollection(studyAreaDict[studyAreaName].akComposites)//.filter(ee.Filter.calendarRange(startYear,endYear,'year'));;
  var akChange = ee.ImageCollection(studyAreaDict[studyAreaName].akChange)//.filter(ee.Filter.calendarRange(startYear,endYear,'year'));;
  var akLC = ee.ImageCollection(studyAreaDict[studyAreaName].akLC)//.filter(ee.Filter.calendarRange(startYear,endYear,'year'));;
  var akLU = ee.ImageCollection(studyAreaDict[studyAreaName].akLU)//.filter(ee.Filter.calendarRange(startYear,endYear,'year'));;
  var akLT = ee.ImageCollection(studyAreaDict[studyAreaName].akLT)//.filter(ee.Filter.calendarRange(startYear,endYear,'year'));;
  var akCCDC = ee.ImageCollection(studyAreaDict[studyAreaName].akCCDC);

  var akChangeFinal = ee.ImageCollection(studyAreaDict[studyAreaName].akChangeFinal).filter(ee.Filter.calendarRange(startYear,endYear,'year'));
  var akLCFinal = ee.ImageCollection(studyAreaDict[studyAreaName].akLCFinal).filter(ee.Filter.calendarRange(startYear,endYear,'year'));
  var akLUFinal = ee.ImageCollection(studyAreaDict[studyAreaName].akLUFinal).filter(ee.Filter.calendarRange(startYear,endYear,'year'));

  var SA = conusSA.merge(akSA);
  var minGainProb = [studyAreaDict[studyAreaName].conusGainThresh,studyAreaDict[studyAreaName].akGainThresh].min();
  var minSlowLossProb = [studyAreaDict[studyAreaName].conusSlowLossThresh,studyAreaDict[studyAreaName].akSlowLossThresh].min();
  var minFastLossProb = [studyAreaDict[studyAreaName].conusFastLossThresh,studyAreaDict[studyAreaName].akFastLossThresh].min();

  //Bring in composites
  var composites = ee.ImageCollection(conusComposites).merge(ee.ImageCollection(akComposites));

  composites = ee.ImageCollection(ee.List.sequence(startYear,endYear,1).map(function(yr){
    return simpleAddIndices(composites.filter(ee.Filter.calendarRange(yr,yr,'year')).mosaic().set('system:time_start',ee.Date.fromYMD(yr,6,1).millis()),1);
  }));

  //Combine different change outputs
  var combinedChange = ee.ImageCollection(years.map(function(yr){
    
    var akCombined = combineChange(akChange,yr,studyAreaDict[studyAreaName].akGainThresh,studyAreaDict[studyAreaName].akSlowLossThresh,studyAreaDict[studyAreaName].akFastLossThresh,'stack',0.01).clip(akSA.geometry().bounds());

    var conusCombined = combineChange(conusChange,yr,studyAreaDict[studyAreaName].conusGainThresh,studyAreaDict[studyAreaName].conusSlowLossThresh,studyAreaDict[studyAreaName].conusFastLossThresh,'collection',0.01).clip(conusSA.geometry().bounds());
    return ee.ImageCollection.fromImages(ee.List([conusCombined,akCombined])).mosaic().set('system:time_start',ee.Date.fromYMD(yr,6,1).millis())
    
    // return conusCombined.set('system:time_start',ee.Date.fromYMD(yr,6,1).millis())
    
    }));

  //Summarize change
  var summaryMethodDescriptionDict = {'Year':'of most recent','Prob' : 'of most probable'}

  var combinedGain = combinedChange.select(['Gain.*']).qualityMosaic('Gain_'+summaryMethod);
  var combinedSlowLoss = combinedChange.select(['Slow_Loss_.*']).qualityMosaic('Slow_Loss_'+ summaryMethod);
  var combinedFastLoss = combinedChange.select(['Fast_Loss_.*']).qualityMosaic('Fast_Loss_'+ summaryMethod);

   //Set up land cover and land use
  var lcClassDict = studyAreaDict[studyAreaName].lcClassDict
  var luClassDict = studyAreaDict[studyAreaName].luClassDict

  var lcNumbers = Object.keys(lcClassDict).map(function(n){return parseInt(n)});
  var lcModelNames = lcNumbers.map(function(key){return lcClassDict[key]['modelName']});
  var lcLegendNames = lcNumbers.map(function(key){return lcClassDict[key]['legendName']});
  var lcLegendColors = lcNumbers.map(function(key){return lcClassDict[key]['color']});

  var luNumbers = Object.keys(luClassDict).map(function(n){return parseInt(n)});
  var luModelNames = luNumbers.map(function(key){return luClassDict[key]['modelName']});
  var luLegendNames = luNumbers.map(function(key){return luClassDict[key]['legendName']});
  var luLegendColors = luNumbers.map(function(key){return luClassDict[key]['color']});
  
  var lcLegendDict = {};var lcQueryDict = {};var luLegendDict = {};var luQueryDict = {};
  lcNumbers.map(function(k){lcLegendDict[lcClassDict[k].legendName] = lcClassDict[k].color});
  lcNumbers.map(function(k){lcQueryDict[k] = lcClassDict[k].legendName});
  luNumbers.map(function(k){luLegendDict[luClassDict[k].legendName] = luClassDict[k].color});
  luNumbers.map(function(k){luQueryDict[k] = luClassDict[k].legendName});

  var LCmax = lcNumbers.max();
  var LUmax = luNumbers.max();
  
  function combineOutputs(c1,c2,years){
    var dummyImage = ee.Image(c2.first());
    var out = years.map(function(yr){
      var i1 = c1.filter(ee.Filter.calendarRange(yr,yr,'year'));
      var i2 = c2.filter(ee.Filter.calendarRange(yr,yr,'year'));

      i1 = ee.Image(fillEmptyCollections(i1,dummyImage).first());
      i2 = ee.Image(fillEmptyCollections(i2,dummyImage).first());
      return ee.ImageCollection([i1,i2]).mosaic().set('system:time_start',ee.Date.fromYMD(yr,6,1).millis())
    })
    return ee.ImageCollection(out);
  }

  var changeFinal = combineOutputs(conusChangeFinal,akChangeFinal,years);
  var luFinal = combineOutputs(conusLUFinal,akLUFinal,years);
  var lcFinal = combineOutputs(conusLCFinal,akLCFinal,years);
  changeFinal = changeFinal.map(function(img){
    return img.updateMask(img.gt(1).and(img.lt(5)))}) ;
  
  lcFinal = lcFinal.map(function(img){return img.updateMask(img.gt(LCmax).not())});
  luFinal = luFinal.map(function(img){return img.updateMask(img.gt(LUmax).not())});

  var slow_loss  = changeFinal.map(function(img){
    var yr = ee.Date(img.get('system:time_start')).get('year');
    var cls = img.eq(2).selfMask();
    return ee.Image(yr).updateMask(cls).int16().copyProperties(img,['system:time_start'])
  })

  var conusLUFinal = ee.ImageCollection(studyAreaDict[studyAreaName].conusLUFinal);

  var combinedLC = ee.ImageCollection(years.map(function(yr){
    var conusCombined = combineLandCover(conusLC,yr,lcNumbers,lcModelNames,'collection',0.01);
    var akCombined = combineLandCover(akLC,yr,lcNumbers,lcModelNames,'stack',0.01);
    return ee.ImageCollection([akCombined,conusCombined]).mosaic().set('system:time_start',ee.Date.fromYMD(yr,6,1).millis())
  }));

  var combinedLU = ee.ImageCollection(years.map(function(yr){
    var conusCombined = combineLandCover(conusLU,yr,luNumbers,luModelNames,'collection',0.01);
    var akCombined = combineLandCover(akLU,yr,luNumbers,luModelNames,'stack',0.01);
    return ee.ImageCollection([akCombined,conusCombined]).mosaic().set('system:time_start',ee.Date.fromYMD(yr,6,1).millis())
  }));

  var lcLayerName =  'Land Cover';//+ startYear.toString() + '-'+ endYear.toString();
  var luLayerName =  'Land Use';// startYear.toString() + '-'+ endYear.toString();
  
  SA = SA.map(function(f){return f.set({'constant':1})})
  // Map2.addLayer(ee.Image(0),{min:0,max:0,palette:'1B1716DD',addToLegend:false})
  // Map2.addLayer(SA.reduceToImage(['constant'],ee.Reducer.first()),{min:1,max:1,palette:'372E2C',addToLegend:false})
  
  // var lcChangeObj = computeThematicChange(lcFinal,lcNumbers,lcLegendColors, lcLegendDict,lcQueryDict, startYear,endYear);
  // var luChangeObj = computeThematicChange(luFinal,luNumbers,luLegendColors, luLegendDict,luQueryDict, startYear,endYear);
  // console.log(lcChangeObj)
  var thematicChangeYearBuffer = 5
  if(analysisMode === 'advanced'){
    Map2.addLayer(luFinal.filter(ee.Filter.calendarRange(startYear,startYear + thematicChangeYearBuffer,'year')).mode().set('bounds',clientBoundary),{title: `Most common land use class from ${startYear} to ${startYear+thematicChangeYearBuffer}.`,layerType : 'geeImage',min:luNumbers.min(),max:luNumbers.max(),palette:luLegendColors,addToClassLegend:true,classLegendDict:luLegendDict,queryDict:luQueryDict},luLayerName + ' Start',false);
    Map2.addLayer(luFinal.filter(ee.Filter.calendarRange(endYear-thematicChangeYearBuffer,endYear,'year')).mode().set('bounds',clientBoundary),{title: `Most common land use class from ${endYear-thematicChangeYearBuffer} to ${endYear}.`,layerType : 'geeImage',min:luNumbers.min(),max:luNumbers.max(),palette:luLegendColors,addToClassLegend:true,classLegendDict:luLegendDict,queryDict:luQueryDict},luLayerName + ' End',false);

      Map2.addLayer(lcFinal.filter(ee.Filter.calendarRange(startYear,startYear + thematicChangeYearBuffer,'year')).mode().set('bounds',clientBoundary),{title: `Most common land cover class from ${startYear} to ${startYear+thematicChangeYearBuffer}.`,layerType : 'geeImage',min:lcNumbers.min(),max:lcNumbers.max(),palette:lcLegendColors,addToClassLegend:true,classLegendDict:lcLegendDict,queryDict:lcQueryDict},lcLayerName + ' Start',false);
    Map2.addLayer(lcFinal.filter(ee.Filter.calendarRange(endYear-thematicChangeYearBuffer,endYear,'year')).mode().set('bounds',clientBoundary),{title: `Most common land cover class from ${endYear-thematicChangeYearBuffer} to ${endYear}.`,layerType : 'geeImage',min:lcNumbers.min(),max:lcNumbers.max(),palette:lcLegendColors,addToClassLegend:true,classLegendDict:lcLegendDict,queryDict:lcQueryDict},lcLayerName + ' End',false);
    // Map2.addLayer(lcChangeObj.change.set('bounds',clientBoundary),lcChangeObj.viz,lcLayerName + ' Change' ,false);
    // Map2.addLayer(luChangeObj.change.set('bounds',clientBoundary),luChangeObj.viz,luLayerName + ' Change' ,false);
  }else{
    Map2.addLayer(luFinal.mode().set('bounds',clientBoundary),{title: `Most common land use class from ${startYear} to ${endYear}.`,layerType : 'geeImage',min:luNumbers.min(),max:luNumbers.max(),palette:luLegendColors,addToClassLegend:true,classLegendDict:luLegendDict,queryDict:luQueryDict},luLayerName,false);
    Map2.addLayer(lcFinal.mode().set('bounds',clientBoundary),{title: `Most common land cover class from ${startYear} to ${endYear}.`,layerType : 'geeImage',min:lcNumbers.min(),max:lcNumbers.max(),palette:lcLegendColors,addToClassLegend:true,classLegendDict:lcLegendDict,queryDict:lcQueryDict},lcLayerName,false);

  }
  
  
  // Map2.addLayer(ee.Image(),{addToClassLegend:true,classLegendDict:{'Slow Loss':changePalette[0],'Fast Loss':changePalette[1],'Gain':changePalette[2]}},'Change')
  //Bring change layers into viewer
  Map2.addLayer(combinedSlowLoss.select(['Slow_Loss_Year']).set('bounds',clientBoundary),{title: `Year ${summaryMethodDescriptionDict[summaryMethod]} vegetation cover loss from a long-term trend event such as drought, tree mortality from insects or disease, etc. from ${startYear} to ${endYear}.`,layerType : 'geeImage',min: startYear, max: endYear, palette: declineYearPalette},`Slow Loss Year`)
  // Map2.addLayer(slow_loss.max().set('bounds',clientBoundary),{title: `Year ${summaryMethodDescriptionDict[summaryMethod]} vegetation cover loss from a long-term trend event such as drought, tree mortality from insects or disease, etc. from ${startYear} to ${endYear}.`,layerType : 'geeImage',min: startYear, max: endYear, palette: declineYearPalette},`Slow Loss Year Fast`)
  if(analysisMode === 'advanced'){
    Map2.addLayer(combinedSlowLoss.select(['Slow_Loss_Prob']).updateMask(combinedSlowLoss.select(['Slow_Loss_Year']).mask()).set('bounds',clientBoundary),{title: `Model confidence ${summaryMethodDescriptionDict[summaryMethod]} vegetation cover loss from a long-term trend event such as drought, tree mortality from insects or disease, etc. from ${startYear} to ${endYear}.`,layerType : 'geeImage',min: minSlowLossProb, max: 0.5, palette: declineProbPalette},'Slow Loss Probability',false);
    Map2.addLayer(combinedChange.select(['Slow_Loss_Year']).reduce(ee.Reducer.count()).set('bounds',clientBoundary),{title: `Duration of vegetation cover loss from a long-term trend event such as drought, tree mortality from insects or disease, etc. from ${startYear} to ${endYear}.`,layerType : 'geeImage',min: 1, max: 5, palette: declineDurPalette,legendLabelLeft:'Year count =',legendLabelRight:'Year count >='},'Slow Loss Duration',false);
  }

  Map2.addLayer(combinedFastLoss.select(['Fast_Loss_Year']).set('bounds',clientBoundary),{title: `Year ${summaryMethodDescriptionDict[summaryMethod]} rapid vegetation cover loss from an external event such as fire/harvest, or change from water inundation/desiccation, etc. from ${startYear} to ${endYear}.`,layerType : 'geeImage', min: startYear, max: endYear, palette: declineYearPalette},'Fast Loss Year');

  if(analysisMode === 'advanced'){
  Map2.addLayer(combinedFastLoss.select(['Fast_Loss_Prob']).updateMask(combinedFastLoss.select(['Fast_Loss_Year']).mask()).set('bounds',clientBoundary),{title: `Model confidence ${summaryMethodDescriptionDict[summaryMethod]} rapid vegetation cover loss from an external event such as fire/harvest, or change from water inundation/desiccation, etc. from ${startYear} to ${endYear}.`,layerType : 'geeImage',min: minFastLossProb, max: 0.5, palette: declineProbPalette},'Fast Loss Probability',false);
    Map2.addLayer(combinedChange.select(['Fast_Loss_Year']).reduce(ee.Reducer.count()).set('bounds',clientBoundary),{title: `Duration of rapid vegetation cover loss from an external event such as fire/harvest, or change from water inundation/desiccation, etc. from ${startYear} to ${endYear}.`,layerType : 'geeImage', min: 1, max: 5, palette: declineDurPalette,legendLabelLeft:'Year count =',legendLabelRight:'Year count >='},'Fast Loss Duration',false);
  }

  Map2.addLayer(combinedGain.select(['Gain_Year']).set('bounds',clientBoundary),{title: `Year ${summaryMethodDescriptionDict[summaryMethod]} vegetation cover gain from ${startYear} to ${endYear}.`,layerType : 'geeImage',min: startYear, max: endYear, palette: gainYearPaletteA},'Gain Year',false);
 
  if(analysisMode === 'advanced'){
  Map2.addLayer(combinedGain.select(['Gain_Prob']).updateMask(combinedGain.select(['Gain_Year']).mask()).set('bounds',clientBoundary),{title: `Model confidence ${summaryMethodDescriptionDict[summaryMethod]} vegetation cover gain from ${startYear} to ${endYear}.`,layerType : 'geeImage', min: minGainProb, max: 0.8, palette: recoveryProbPalette},'Gain Probability',false);
    Map2.addLayer(combinedChange.select(['Gain_Year']).reduce(ee.Reducer.count()).set('bounds',clientBoundary),{title: `Vegetation cover gain duration from ${startYear} to ${endYear}.`,layerType : 'geeImage', min: 1, max: 5, palette: recoveryDurPalette,legendLabelLeft:'Year count =',legendLabelRight:'Year count >='},'Gain Duration',false);
  }
  var combinedChangeC = combinedChange.select(['maxClass']);//.map(function(img){return img.unmask(0)})
  
  // Map2.addTimeLapse('https://storage.googleapis.com/lcms-final-tile-outputs/LCMS_v2020-5_Change_',{timeLapseType :'tileMapService',years:years,addToClassLegend: true,classLegendDict:{'Slow Disturbance':changePalette[0],'Fast Disturbance':changePalette[1],'Growth':changePalette[2]}},'LCMS Change Time Lapse',false)
  // Map2.addTimeLapse('https://storage.googleapis.com/lcms-final-tile-outputs/LCMS_v2020-5_Land_Cover_',{timeLapseType :'tileMapService',years:years,addToClassLegend: true,classLegendDict:lcLegendDict},'LCMS Land Cover Time Lapse',false)
  
  // Map2.addLayer(ee.Image().paint(SA,null,1),{min:1,max:1,palette:'00BFA5',addToLegend:false})


  if(urlParams.addLCMSTimeLapsesOn === 'yes'){
    Map2.addTimeLapse(changeFinal.filter(ee.Filter.calendarRange(startYear,endYear,'year')).set('bounds',clientBoundary),{min:1,max:5,palette:changePaletteFull,addToClassLegend: true,classLegendDict:{'Slow Loss':changePalette[0],'Fast Loss':changePalette[1],'Gain':changePalette[2]},queryDict: {1:'Stable',2:'Slow Loss',3:'Fast Loss',4:'Gain',5:'No data (cloud/cloud shadow)'},years:years},'LCMS Change Time Lapse',false);
    Map2.addTimeLapse(lcFinal.filter(ee.Filter.calendarRange(startYear,endYear,'year')).set('bounds',clientBoundary),{title: `Annual land cover class from ${startYear} to ${endYear}.`,min:lcNumbers.min(),max:lcNumbers.max(),palette:lcLegendColors,addToClassLegend:true,classLegendDict:lcLegendDict,queryDict:lcQueryDict,years:years},'LCMS Land Cover Time Lapse',false);
    Map2.addTimeLapse(luFinal.filter(ee.Filter.calendarRange(startYear,endYear,'year')).set('bounds',clientBoundary),{title: `Annual land use class from ${startYear} to ${endYear}.`,min:luNumbers.min(),max:luNumbers.max(),palette:luLegendColors,addToClassLegend:true,classLegendDict:luLegendDict,queryDict:luQueryDict,years:years},'LCMS Land Use Time Lapse',false);
  }
  // var bucket = 'gs://lcms-cogtifs/LCMS_SEAK_v2020-5/LCMS_CONUSTest_v2020-5';
  // var cogChangeC = ee.ImageCollection(years.map(function(yr){
  //   var img = ee.Image.loadGeoTIFF(bucket + '_Change_'+yr.toString()+'.tif');
  //   img = img.set('system:time_start',ee.Date.fromYMD(yr,6,1).millis()).updateMask(img.neq(0));
  //   return img
   
  // }));
  // // printEE(cogChangeC)
  //  Map2.addTimeLapse(cogChangeC,{min:1,max:5,palette:changePaletteFull,addToClassLegend: true,classLegendDict:{'Slow Disturbance':changePaletteFull[1],'Fast Disturbance':changePaletteFull[2],'Growth':changePaletteFull[3]},queryDict: {0:'Stable',1:'Slow Disturbance',2:'Fast Disturbance',3:'Growth',4:'No data (cloud/cloud shadow)'}},'LCMS Change Time Lapse',false)

   // var combinedChangeCT =combinedChange.filter(ee.Filter.calendarRange(startYear,endYear,'year')).map(function(img){
   //  var maxClass = img.select(['maxClass']);
   //  var stable = img.select(['processingMask']).and(maxClass.mask().not());
   //  var out = ee.Image(0);
   //  out = out.where(maxClass.mask(),maxClass);
   //  out = out.where(img.select(['processingMask']).not(),4);
   //  return out.clip(SA).unmask(5).copyProperties(img,['system:time_start'])
   // })
   // Map2.addTimeLapse(combinedChangeCT,{min:0,max:5,palette:changePaletteFull,addToClassLegend: true,classLegendDict:{'Slow Disturbance':changePaletteFull[1],'Fast Disturbance':changePaletteFull[2],'Growth':changePaletteFull[3]},queryDict: {0:'Stable',1:'Slow Disturbance',2:'Fast Disturbance',3:'Growth',4:'No data (cloud/cloud shadow)'}},'LCMS Change Time Lapse',false)

  // Map2.addLayer(SA ,{layerType:'geeVectorImage'},'Study Area Boundaries',true,null,null,'Boundaries of study areas LCMS data are available within.','reference-layer-list');
//   var geometry = ee.Geometry.MultiPoint(
//         [[-98.4080078125, 26.926671930180973],
//          [-97.39081810492497, 25.850508753365283],
//          [-99.1400468344283, 26.68520465659919]]);
//   var ccdc = ee.ImageCollection("projects/CCDC/USA_V2").filterBounds(conusSA).filter(ee.Filter.eq('spectral', 'SR')).filterBounds(geometry)
// var indices = ee.Dictionary(ccdc.aggregate_histogram('system:index')).keys().getInfo()
// indices.map(function(index){
//   var i = ccdc.filter(ee.Filter.eq('system:index',index))
//   Map2.addLayer(i,{},index,true)
// })
//   Map2.addLayer(ee.FeatureCollection('projects/lcms-tcc-shared/assets/Processing-Tiles/CONUS/CONUS-Tiles-480000m-buffer-900m'),{layerType:'geeVector'},'tiles'
// )
  //Set up pixel charting change time series
  var whichIndex = 'NBR';

  //Set up CCDC
  var ccdcIndicesSelector = ['tStart','tEnd','tBreak','changeProb',whichIndex+'_.*','NDVI_.*'];
  akCCDC = akCCDC.select(ccdcIndicesSelector);
  conusCCDC = conusCCDC.select(ccdcIndicesSelector);
  var f= ee.Image(conusCCDC.first());
  var ccdcImg = ee.Image(conusCCDC.merge(akCCDC).mosaic().copyProperties(f));
  var whichHarmonics = [1,2,3];
  var fillGaps = true;
  var fraction = 0.6657534246575343;
  var annualImages = simpleGetTimeImageCollection(ee.Number(startYear+fraction),ee.Number(endYear+1+fraction),1);
  var fittedCCDC = predictCCDC(ccdcImg,annualImages,fillGaps,whichHarmonics).select([whichIndex+'_predicted'],['CCDC Fitted '+whichIndex]).map(setSameDate);
  
  //Set up LANDTRENDR
  var lt = conusLT.filter(ee.Filter.eq('band',whichIndex)).merge(akLT.filter(ee.Filter.eq('band',whichIndex))).mosaic();
  var fittedAsset = ltStackToFitted(lt,1984,2020).filter(ee.Filter.calendarRange(startYear,endYear,'year')).select(['fit'],['LANDTRENDR Fitted '+ whichIndex]);
 
  //Join raw time series to lt fitted and ccdc fitted
  var changePixelChartCollection = joinCollections(composites.select([whichIndex],['Raw '+whichIndex]),fittedAsset,false);
  changePixelChartCollection = joinCollections(changePixelChartCollection,fittedCCDC,false);

  //Set up change prob outputs for pixel charting
  var probCollection = combinedChange.select(['.*_Prob']).select(['Slow_Loss_Prob','Fast_Loss_Prob','Gain_Prob'],['Slow Loss Probability','Fast Loss Probability','Gain Probability'])
  changePixelChartCollection = joinCollections(changePixelChartCollection,probCollection,false);

  pixelChartCollections['all-loss-gain-'+whichIndex] = {'label':'LCMS Change Time Series',
                                  'collection':changePixelChartCollection,//chartCollection.select(['Raw.*','LANDTRENDR.*','.*Loss Probability','Gain Probability']),
                                  'chartColors':chartColorsDict.allLossGain2,
                                  'tooltip':'Chart slow loss, fast loss, gain and the '+whichIndex + ' vegetation index',
                                  'xAxisLabel':'Year',
                                  'yAxisLabel':'Model Confidence or Index Value',
                                  'fieldsHidden':[true,true,true,false,false,false]}
  var lcForPixelCharting = combinedLC.select(['.*_Prob'],lcLegendNames);
                  
  pixelChartCollections['land-cover'] = {'label':'LCMS Land Cover Time Series',
                                  'collection':lcForPixelCharting,//chartCollection.select(['Raw.*','LANDTRENDR.*','.*Loss Probability','Gain Probability']),
                                  'chartColors':lcLegendColors,
                                  'tooltip':'Chart land cover model confidence for each individual class',
                                  'xAxisLabel':'Year',
                                  'yAxisLabel':'Model Confidence'}
  
  var luForPixelCharting = combinedLU.select(['.*_Prob'],luLegendNames);;
                      
  pixelChartCollections['land-use'] = {'label':'LCMS Land Use Time Series',
                                  'collection':luForPixelCharting,//chartCollection.select(['Raw.*','LANDTRENDR.*','.*Loss Probability','Gain Probability']),
                                  'chartColors':luLegendColors,
                                  'tooltip':'Chart land use model confidence for each individual class',
                                  'xAxisLabel':'Year',
                                  'yAxisLabel':'Model Confidence'}

  // var changeForAreaCharting = combinedChange.select(['.*_Mask']).map(function(img){
  //   var change = img.unmask(0).select([0,1,2],['Slow Loss','Fast Loss','Gain']);
  //   // var notChange = img.mask().reduce(ee.Reducer.max()).not().rename(['Stable'])
  //   return change.copyProperties(img,['system:time_start']);
  // })
  // Map2.addLayer(changeFinal,{},'cangefinal')

  var changeForAreaCharting = formatAreaChartCollection(changeFinal.map(function(img){return img.unmask(0)}),[2,3,4],['Slow Loss','Fast Loss','Gain']);
  var lcForAreaCharting = formatAreaChartCollection(lcFinal,lcNumbers,lcLegendNames);
  var luForAreaCharting = formatAreaChartCollection(luFinal,luNumbers,luLegendNames);
  
  // printEE(changeForAreaCharting)
  // var lcForAreaCharting = combinedLC.select(['.*_Mask'],lcLegendNames).map(function(img){return img.unmask(0)});
  // var luForAreaCharting = combinedLU.select(['.*_Mask'],luLegendNames).map(function(img){return img.unmask(0)});
  
  getSelectLayers(true);
  
   areaChartCollections['change'] = {'label':'LCMS Change',
                                  'collection':changeForAreaCharting,
                                  'stacked':false,
                                  'steppedLine':false,
                                  'tooltip':'Summarize change classes for each year',
                                  'colors':chartColorsDict.allLossGain2Area,
                                  'xAxisLabel':'Year'};
   areaChartCollections['lc'] = {'label':'LCMS Land Cover',
                                  'collection':lcForAreaCharting,
                                  'stacked':false,
                                  'steppedLine':false,
                                  'tooltip':'Summarize land cover classes for each year',
                                  'colors':lcLegendColors,
                                  'xAxisLabel':'Year'};
     areaChartCollections['lu'] = {'label':'LCMS Land Use',
                                  'collection':luForAreaCharting,
                                  'stacked':false,
                                  'steppedLine':false,
                                  'tooltip':'Summarize land use classes for each year',
                                  'colors':luLegendColors,
                                  'xAxisLabel':'Year'};
  getHansen();
  getMTBSandIDS();
  populatePixelChartDropdown();
    populateAreaChartDropdown();
    
    $('#summary-spinner').hide();

}



// function runGTAC(){};
// function runGTAC(){

//   //Set up some params
//   startYear = parseInt(urlParams.startYear);
//   endYear = parseInt(urlParams.endYear);

//   analysisMode = urlParams.analysisMode;
//   queryClassDict = {};
//   var years = range(startYear,endYear+1);
//   summaryMethod = urlParams.summaryMethod.toTitle();
//   getLCMSVariables();
  
  
//   ga('send', 'event', 'lcms-gtac-viewer-run', 'year_range', `${startYear}_${endYear}`);
//   ga('send', 'event', 'lcms-gtac-viewer-run', 'analysis_mode', analysisMode);
//   ga('send', 'event', 'lcms-gtac-viewer-run', 'timelapse_on', urlParams.addLCMSTimeLapsesOn);
//   ga('send', 'event', 'lcms-gtac-viewer-run', 'summary_method', summaryMethod);

//   var lcmsRun = {};
//   var lcmsRunFuns = {};

//   lcmsRunFuns.getMaskedWYr = function(c, code){
//     return c.map(function(img) {
//       var yr = ee.Date(img.get('system:time_start')).get('year');
//       var yrImg = ee.Image(yr).int16().rename(['Year']);
//       return img.addBands(yrImg).updateMask(img.select([0]).eq(code))
//         .copyProperties(img,['system:time_start']);
//     });
//   }
//   lcmsRun.lcms = ee.ImageCollection('USFS/GTAC/LCMS/v2020-5')
//             .filter(ee.Filter.calendarRange(startYear,endYear,'year'));

//   lcmsRun.f = ee.Image(lcmsRun.lcms.first())

  
//   Map2.addLayer(lcmsRun.lcms.select(['Land_Cover']).mode().copyProperties(lcmsRun.f),{autoViz:true,layerType:'geeImage'},'Land Cover',false);
//   Map2.addLayer(lcmsRun.lcms.select(['Land_Use']).mode().copyProperties(lcmsRun.f),{autoViz:true,layerType:'geeImage'},'Land Use',false);

//   lcmsRun.slowLoss = lcmsRunFuns.getMaskedWYr(lcmsRun.lcms.select(['Change','Change_Raw_Probability_Slow_Loss'],['Change','Prob']),2).qualityMosaic(summaryMethod)
//   lcmsRun.fastLoss = lcmsRunFuns.getMaskedWYr(lcmsRun.lcms.select(['Change','Change_Raw_Probability_Fast_Loss'],['Change','Prob']),3).qualityMosaic(summaryMethod)
//   lcmsRun.gain = lcmsRunFuns.getMaskedWYr(lcmsRun.lcms.select(['Change','Change_Raw_Probability_Fast_Loss'],['Change','Prob']),4).qualityMosaic(summaryMethod)
  
//   Map2.addLayer(lcmsRun.fastLoss.select(['Year']),{min:startYear,max:endYear,palette:declineYearPalette,layerType:'geeImage'},'Fast Loss Year');

//   Map2.addLayer(lcmsRun.fastLoss.select(['Prob']).divide(100),{min:0.3,max:0.5,palette:declineProbPalette,layerType:'geeImage'},'Fast Loss Probability');

//   Map2.addLayer(lcmsRun.slowLoss.select(['Year']),{min:startYear,max:endYear,palette:declineYearPalette,layerType:'geeImage'},'Slow Loss Year');
//   Map2.addLayer(lcmsRun.slowLoss.select(['Prob']).divide(100),{min:0.2,max:0.5,palette:declineProbPalette,layerType:'geeImage'},'Slow Loss Probability');

//   Map2.addLayer(lcmsRun.gain.select(['Year']),{min:startYear,max:endYear,palette:gainYearPaletteA,layerType:'geeImage'},'Gain Year');


//   }