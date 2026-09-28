export const publicAnalyticsPages={"/":"Accueil","/pricing":"Tarification","/login":"Connexion"};
export function analyticsPage(pathname){return Object.hasOwn(publicAnalyticsPages,pathname)?{path:pathname,title:publicAnalyticsPages[pathname]}:null;}
export function clearAnalyticsCookies(document,base="/"){
  for(const part of document.cookie.split(";")){
    const name=part.split("=")[0].trim();
    if(!/^_ga(?:_|$)/.test(name))continue;
    for(const path of new Set(["/",base]))document.cookie=`${name}=; Max-Age=0; Path=${path}; SameSite=Lax`;
    const host=document.location.hostname;
    document.cookie=`${name}=; Max-Age=0; Path=/; Domain=${host}; SameSite=Lax`;
    document.cookie=`${name}=; Max-Age=0; Path=/; Domain=.${host}; SameSite=Lax`;
  }
}
