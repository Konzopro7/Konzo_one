import { GoogleAuth } from "google-auth-library";
import { query } from "../db.js";

let cached;
let pending;
export async function analyticsConfig() {
  const {rows}=await query("SELECT ga4_enabled,ga4_measurement_id,ga4_property_id,updated_at FROM platform_settings WHERE id=1");
  const row=rows[0]||{};
  return {enabled:Boolean(row.ga4_enabled),measurementId:row.ga4_measurement_id||"",propertyId:row.ga4_property_id||"",credentialsConfigured:Boolean(process.env.GA4_CREDENTIALS_PATH),updatedAt:row.updated_at};
}
export async function analyticsReport(days, request) {
  const config=await analyticsConfig();
  if (!config.propertyId || (!config.credentialsConfigured&&!request)) return {configured:false,config};
  const cacheKey=`${config.propertyId}:${config.updatedAt}:${days}`;
  if (!request && cached?.key===cacheKey && cached.expires>Date.now()) return cached.value;
  if (!request && pending?.key===cacheKey) return pending.promise;
  const work = async () => {
    const client = request ? null : await new GoogleAuth({keyFilename:process.env.GA4_CREDENTIALS_PATH,scopes:["https://www.googleapis.com/auth/analytics.readonly"]}).getClient();
    const run = request || (async body => {
      const result=await client.request({url:`https://analyticsdata.googleapis.com/v1beta/properties/${config.propertyId}:runReport`,method:"POST",data:body,timeout:12000});
      return result.data;
    });
    const base={dateRanges:[{startDate:`${days-1}daysAgo`,endDate:"today"}],keepEmptyRows:false};
    const [totals,series,sources,pages]=await Promise.all([
      run({...base,metrics:["activeUsers","sessions","screenPageViews","engagementRate"].map(name=>({name}))}),
      run({...base,dimensions:[{name:"date"}],metrics:[{name:"sessions"},{name:"activeUsers"}],orderBys:[{dimension:{dimensionName:"date"}}],limit:"90"}),
      run({...base,dimensions:[{name:"sessionDefaultChannelGroup"}],metrics:[{name:"sessions"}],orderBys:[{metric:{metricName:"sessions"},desc:true}],limit:"8"}),
      run({...base,dimensions:[{name:"pagePath"}],metrics:[{name:"screenPageViews"}],orderBys:[{metric:{metricName:"screenPageViews"},desc:true}],limit:"10"})
    ]);
    const values=totals.rows?.[0]?.metricValues||[];
    const number=(array,index)=>Number(array?.[index]?.value||0);
    const value={configured:true,config,days,fetchedAt:new Date().toISOString(),metrics:{users:number(values,0),sessions:number(values,1),views:number(values,2),engagementRate:number(values,3)},series:(series.rows||[]).map(row=>({day:row.dimensionValues[0].value,sessions:number(row.metricValues,0),users:number(row.metricValues,1)})),sources:(sources.rows||[]).map(row=>({name:row.dimensionValues[0].value,sessions:number(row.metricValues,0)})),pages:(pages.rows||[]).map(row=>({path:row.dimensionValues[0].value,views:number(row.metricValues,0)}))};
    if (!request) cached={key:cacheKey,value,expires:Date.now()+5*60*1000};
    return value;
  };
  if (request) return work();
  const promise=work(); pending={key:cacheKey,promise};
  try {return await promise;} finally {if(pending?.promise===promise) pending=null;}
}
