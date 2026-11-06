/** Built app pages in disposable Chromium with local visual fixtures.
 * Synthetic role responses only drive the frontend; authentication and server
 * authorization are not tested. Allowlisted fixture writes remain loopback-only;
 * no live account or hosted API is contacted. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const root=path.resolve(process.env.PINEVELA_UI_BUILD_DIR||'dist-supabase'),output=process.env.PINEVELA_THEME_OUTPUT||'/tmp/pinevela-public-appearance-20261028';
 await fs.mkdir(output,{recursive:true});await fs.rm(output+'/failure.json',{force:true});await fs.rm(output+'/failure.png',{force:true});
 const apiRequests=[],apiRequestsByScene=[],mutations=[],legalAcceptances=[],acceptedLegalScenes=new Set();
 const sellerWorkflows=process.env.PINEVELA_SELLER_WORKFLOWS==='1';
 const androidLayoutUi=process.env.PINEVELA_ANDROID_LAYOUT_UI==='1';
 const androidLayout=androidLayoutUi?require('./lib/android-safe-area-browser-checks.cjs'):null;
 const profileToastUi=process.env.PINEVELA_PROFILE_TOAST_UI==='1',profileAvatars=new Map();
 const googleReturnUi=process.env.PINEVELA_GOOGLE_RETURN_UI==='1';
 const managerFixUi=process.env.PINEVELA_MANAGER_FIX_UI==='1',managerTermAttempts=new Map();
 const catalogCacheUi=process.env.PINEVELA_CATALOG_CACHE_UI==='1',photoRequests=[];
 const residentPinUi=process.env.PINEVELA_RESIDENT_PIN_UI==='1',residentPinRequests=[];
 const nearbyUi=process.env.PINEVELA_NEARBY_UI==='1',mapStoreRequests=[];
 const nearbyStores=nearbyUi?require('./lib/nearby-ui-fixtures.cjs'):null;
 const subscriptionUi=process.env.PINEVELA_SUBSCRIPTIONS_UI==='1',subscriptionCheckouts=[],settingsStreams=new Set();
 let subscriptionRates={default:7.25,star:127.35,pro:211.5};
 const setSubscriptionRates=(rates,notify=false)=>{subscriptionRates={...rates};if(notify)for(const response of settingsStreams)response.write('data: '+JSON.stringify({entity:'settings'})+'\n\n');};
 const curvedNavUi=process.env.PINEVELA_CURVED_NAV_UI==='1';
 const sidebarUi=process.env.PINEVELA_SIDEBAR_UI==='1';
 const shortKeysUi=process.env.PINEVELA_SHORT_KEYS_UI==='1',managerCodeRotations=[];
 const mobileUi=process.env.PINEVELA_MOBILE_UI==='1'||androidLayoutUi||profileToastUi||curvedNavUi||sidebarUi||nearbyUi,appearanceSaves=[],savedAppearance=new Map();
 const sellerMutations=[],signupResumeMutations=[];
 const products=Array.from({length:3},(_,i)=>({id:'browser-fixture-item-'+i,storeId:'browser-fixture-store',storeName:'Campus fixture store',title:['Study essentials','Campus headphones','Everyday backpack'][i],description:'Local browser-test fixture.',price:30+i*20,category:'Education',imageUrl:'/icons/pinevela-192.png',stockQuantity:3,status:'Available'}));
 const mobileServices=[0,1].map(i=>({...products[0],id:'browser-fixture-service-'+i,title:i?'Campus printing and graphic design service with a long title':'Phone screen repair',isService:true,category:'Services',serviceCategory:'Graphic Design & Printing',serviceLocationMode:'flexible',callLine:'+233241234567',location:'Ayeduase Gate, Kumasi',sellerUniversity:'KNUST',workingDays:'Mon - Sat',openingTime:'08:00',closingTime:'18:00',isAvailable:true,stockQuantity:null}));
 let catalog=mobileUi?[...products.slice(0,2),...mobileServices]:products;
 const orders=mobileUi?['Awaiting Seller Confirmation','Completed & Paid','Cancelled'].map((status,i)=>({id:['7f535369-873a-40a1-98f7-57f1d219e72b','f65d1540-38da-41a5-b782-482e873ef1a2','d7bea683-e9b1-44c7-bd11-a2ff2c580946'][i],productId:products[0].id,productTitle:['Study essentials','Campus printing service','Everyday backpack'][i],productImage:'/icons/pinevela-192.png',productPrice:120,quantity:1,totalAmount:120,buyerId:'theme-fixture-user',buyerEmail:'theme-fixture-user@pinevela.invalid',buyerName:'Fixture buyer',buyerPhone:'+233241234567',sellerId:'theme-fixture-merchant',sellerEmail:'theme-fixture-merchant@pinevela.invalid',storeId:'browser-fixture-store',storeName:'Campus fixture store',university:'KNUST',meetingLocation:'KNUST - Commercial Area / Library',meetingLatitude:6.675,meetingLongitude:-1.572,sellerConfirmed:false,otpPin:i===0?'491638':undefined,deliveryPinState:i===0?'active':'unavailable',deliveryPinExpiresAt:new Date(Date.now()+86400000).toISOString(),paymentMethod:'Pay on Campus Delivery',status,createdAt:'2026-10-30T23:39:00Z',updatedAt:'2026-10-30T23:39:00Z',timeline:[{id:'fixture-event-'+i,status,title:'Purchase request created',timestamp:'2026-10-30T23:39:00Z'}]})):[];
 const hostels=Array.from({length:3},(_,i)=>({id:'browser-fixture-residence-'+i,name:['Campus residence','Garden residence','Student residence'][i],location:'Local browser fixture',isApproved:true,managerName:'Fixture manager',hostelType:'Hostel'}));
 const originalHostels=hostels.map(hostel=>({...hostel}));
 const photoPath=(kind,i=0)=>`/api/media/${kind.repeat(8)}-${kind.repeat(4)}-4${kind.repeat(3)}-8${kind.repeat(3)}-${String(i+1).padStart(12,'0')}`;
 const resetCatalogPhotos=()=>{
  catalog=products.map((item,i)=>({...item,imageUrl:photoPath('1',i)}));
  hostels.splice(0,hostels.length,...originalHostels.map((hostel,i)=>({...hostel,imageUrl:photoPath('2',i)})));
  orders.forEach((order,i)=>{order.productImage=photoPath('6',i);});
  photoRequests.length=0;
 };
 const notifyCatalog=()=>{for(const response of settingsStreams)response.write('data: '+JSON.stringify({entity:'hostels'})+'\n\n');};
 if(catalogCacheUi)resetCatalogPhotos();
 const photoBytes=catalogCacheUi?await fs.readFile(path.join(root,'icons/pinevela-192.png')):null;
 const server=http.createServer(async(req,res)=>{
  try{
   if(nearbyUi)res.setHeader('Permissions-Policy','geolocation=()');
   const url=new URL(req.url,'http://127.0.0.1'),route=url.pathname,referer=new URL(req.headers.referer||'/','http://127.0.0.1');
   const role=referer.searchParams.get('visual_role'),theme=referer.searchParams.get('visual_theme')||'system';
   const navUrgency=(curvedNavUi||nearbyUi)&&role==='manager'?referer.searchParams.get('visual_nav_urgency'):null;
   const pendingTerms=referer.searchParams.get('visual_terms')?.startsWith('pending'),legalScene=referer.searchParams.get('scene');
   const legal={accepted:!pendingTerms||acceptedLegalScenes.has(legalScene),document:{version:'2026-11-05',href:'/legal/terms-2026-11-05.html',privacyHref:'/privacy.html'}};
   const user=role&&['user','student','manager','staff','admin','merchant','field_officer'].includes(role)?{id:'theme-fixture-'+role,role,name:'Visual fixture '+role,email:'theme-fixture-'+role+'@pinevela.invalid',isVerified:true,hasCustomerServiceAccess:true,hasApprovedHostel:navUrgency==='primary',legal,...(profileAvatars.has(legalScene)?{avatar:profileAvatars.get(legalScene)}:{})}:null;
   if(route.startsWith('/api/')){
    apiRequests.push(route);apiRequestsByScene.push({path:route,scene:legalScene});res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    if(residentPinUi&&route==='/api/auth/captcha')return res.end(JSON.stringify({enabled:false}));
    if(residentPinUi&&req.method==='POST'&&['/api/room-keys/verify','/api/auth/resident-activate','/api/auth/login','/api/auth/resident-pin/reset'].includes(route)){
     let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1024)throw Error('Oversized resident visual fixture');}
     const body=JSON.parse(raw);residentPinRequests.push({route,body});
     if(route==='/api/room-keys/verify')return res.end(JSON.stringify({roomKey:body.roomKey,hostelName:'Visual fixture residence',blockName:'Pine',roomNumber:'101'}));
     if(route.endsWith('/resident-pin/reset'))return res.end(JSON.stringify({success:true}));
     res.writeHead(route.endsWith('/login')?401:400);return res.end(JSON.stringify({error:'Visual fixture submission received.'}));
    }
    if((subscriptionUi||catalogCacheUi)&&route==='/api/sync/events'){res.setHeader('Content-Type','text/event-stream');res.write('data: connected\n\n');settingsStreams.add(res);req.on('close',()=>settingsStreams.delete(res));return;}
    if(catalogCacheUi&&route.startsWith('/api/media/')){
     const missing=route===photoPath('9'),etag='"pv-'+route.split('/').pop()+'-'+ 'a'.repeat(64)+'"';
     const status=missing?404:req.headers['if-none-match']===etag?304:200;
     photoRequests.push({path:route,status,bytes:status===200?photoBytes.length:0,conditional:!!req.headers['if-none-match'],variant:url.searchParams.get('size')});
     if(missing){res.writeHead(404);return res.end('{}');}
     res.setHeader('Content-Type','image/png');res.setHeader('Cache-Control','private, no-cache, max-age=0, must-revalidate');res.setHeader('ETag',etag);res.setHeader('X-PineVela-Public-Photo','1');
     res.writeHead(status);return res.end(status===200?photoBytes:undefined);
    }
    if(subscriptionUi&&user?.role==='merchant'&&req.method==='POST'&&route==='/api/payments/paystack/initialize'){let raw='';for await(const c of req){raw+=c;if(raw.length>1000)throw Error('Oversized fixture checkout');}subscriptionCheckouts.push({body:JSON.parse(raw),scene:legalScene});await pause(1000);res.writeHead(503);return res.end(JSON.stringify({error:'Local checkout fixture: no payment was created.'}));}
    if(shortKeysUi&&user?.role==='manager'&&route==='/api/manager/secret-key')return res.end(JSON.stringify({available:true,issueRequired:false}));
    if(shortKeysUi&&user?.role==='manager'&&req.method==='POST'&&route==='/api/manager/secret-key/rotate'){
     const allowed=req.headers['x-pinevela-manager-key']==='L'.repeat(43);
     managerCodeRotations.push({scene:legalScene,status:allowed?200:403});
     if(!allowed){res.writeHead(403);return res.end(JSON.stringify({error:req.headers['x-pinevela-manager-key']?'Invalid manager secret key. Check and try again.':'Enter your current manager secret key.',managerKeyRequired:true}));}
     return res.end(JSON.stringify({key:'246802'}));
    }
    if((curvedNavUi||nearbyUi)&&user?.role==='manager'&&req.method==='POST'&&route==='/api/manager/welcome/ensure')return res.end(JSON.stringify({show:false}));
    if(req.method==='POST'&&route==='/api/legal/accept'&&pendingTerms){
     let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2048)throw Error('Unexpected fixture input size');}
     const body=JSON.parse(raw);assert.deepEqual(body,{termsAcceptance:{accepted:true,version:'2026-11-05'}});legalAcceptances.push({scene:legalScene,body});
     if(managerFixUi&&referer.searchParams.get('visual_terms')==='pending-manager-key'){res.writeHead(403);return res.end(JSON.stringify({error:'Enter your current manager secret key to authorize this action.',managerKeyRequired:true}));}
     if(managerFixUi&&referer.searchParams.get('visual_terms')==='pending-hang')return;
     if(managerFixUi&&referer.searchParams.get('visual_terms')==='pending-retry'){
      const attempt=1+(managerTermAttempts.get(legalScene)||0);managerTermAttempts.set(legalScene,attempt);
      if(attempt===1){res.writeHead(503);return res.end(JSON.stringify({error:'Local fixture: acceptance could not be saved.'}));}
     }
     if(referer.searchParams.get('visual_terms')==='pending-failure'){res.writeHead(503);return res.end(JSON.stringify({error:'Local fixture save unavailable'}));}
     acceptedLegalScenes.add(legalScene);return res.end(JSON.stringify({...user,legal:{...legal,accepted:true}}));
    }
    if(sellerWorkflows&&referer.searchParams.has('visual_signup_resume')){
     if(route==='/api/auth/captcha')return res.end(JSON.stringify({enabled:false}));
     if(req.method==='POST'&&['/api/auth/register-unified','/api/auth/verify-unified'].includes(route)){
      let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4000)throw Error('Oversized synthetic signup');}
      signupResumeMutations.push({route,body:JSON.parse(raw),scene:legalScene});
      if(route.endsWith('/register-unified')){
       const cooldown=referer.searchParams.get('visual_signup_resume')==='cooldown';
       if(cooldown&&signupResumeMutations.filter(m=>m.route===route&&m.scene===legalScene).length>1){res.writeHead(429,{'Retry-After':'300'});return res.end(JSON.stringify({error:'Please wait before requesting another code.'}));}
       res.writeHead(202);return res.end(JSON.stringify({signupId:'14bf1982-bd63-4c77-b55a-5e54f8a3860e',verificationRequired:true,resumed:!cooldown,retryAfter:300}));
      }
      res.writeHead(400);return res.end(JSON.stringify({error:'This fixture code is invalid or expired.'}));
     }
    }
    if(sellerWorkflows&&user?.role==='merchant'&&req.method==='POST'&&['/api/digital-market/products','/api/digital-market/store-setup','/api/payments/paystack/initialize'].includes(route)){
     let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16000)throw Error('Fixture input is too large');}const body=JSON.parse(raw);sellerMutations.push({route,body});
     if(route==='/api/payments/paystack/initialize'){res.writeHead(503);return res.end(JSON.stringify({error:'Paystack is not configured. Ask an administrator to configure secure checkout.'}));}
     if(route==='/api/digital-market/store-setup')return res.end(JSON.stringify({success:true}));
     res.writeHead(422);return res.end(JSON.stringify({error:'This photograph must pass its safety review before it can be used.'}));
    }
    if(mobileUi&&user&&req.method==='PUT'&&route==='/api/auth/appearance'){
     let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>100)throw Error('Oversized appearance fixture');}const b=JSON.parse(raw);assert(['light','dark','system'].includes(b.theme));assert.deepEqual(Object.keys(b),['theme']);appearanceSaves.push({scene:legalScene,theme:b.theme});savedAppearance.set(legalScene,b.theme);return res.end(JSON.stringify({theme:b.theme}));
    }
    if(profileToastUi&&user&&req.method==='PUT'&&route==='/api/auth/profile'){
     let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1000)throw Error('Oversized local profile fixture');}
     const body=JSON.parse(raw);assert.deepEqual(Object.keys(body).sort(),['avatar','avatarUrl','photo','photoUrl','profilePicture']);
     assert(Object.values(body).every(value=>value==='preset:pine-emerald'));assert.equal(req.headers['x-pinevela-profile-context'],user.id);
     profileAvatars.set(legalScene,body.avatar);return res.end(JSON.stringify({success:true,user:{...user,avatar:body.avatar}}));
    }
    if(req.method!=='GET'){mutations.push(route);res.writeHead(405);return res.end('{}');}
    if(nearbyUi&&route==='/api/digital-market/stores'){const q=(url.searchParams.get('q')||'').toLowerCase();mapStoreRequests.push({route,q});return res.end(JSON.stringify({stores:nearbyStores.stores.filter(s=>!q||[s.storeName,s.location,s.category,s.campus,...nearbyStores.products.filter(p=>p.storeId===s.id).map(p=>p.title)].join(' ').toLowerCase().includes(q)),hasMore:false}));}
    if(nearbyUi&&/^\/api\/digital-market\/stores\/[^/]+\/map-location$/.test(route)){const id=route.split('/')[4];mapStoreRequests.push({route,id});if(id===nearbyStores.unpinned){res.writeHead(503);return res.end(JSON.stringify({error:'Local fixture location provider unavailable'}));}return res.end(JSON.stringify({point:{lat:6.6845316,lng:-1.5800191},precision:'approximate',label:'Bomso, Ghana'}));}
    if(googleReturnUi&&route==='/api/auth/mobile/status')return res.end(JSON.stringify({active:true,provider:'google',mode:'login',fresh:referer.searchParams.get('visual_return')!=='stale'}));
    if(route==='/api/auth/me'){if(user)return res.end(JSON.stringify(user));res.writeHead(401);return res.end('{}');}
    if(route==='/api/legal/status'&&user)return res.end(JSON.stringify(legal));
    if(route==='/api/settings')return res.end(JSON.stringify({maintenanceMode:false,contactDetails:{linkedinUrl:'',whatsappNumber:'',facebookUrl:'',tiktokUrl:''},registrationFee:0,semesterFee:0,commission:0,subscriptionPrices:subscriptionUi?(referer.searchParams.get('visual_prices')==='missing'?{default:7.25,pro:211.5}:subscriptionRates):{default:0,star:0,pro:0},announcement:''}));
    if(route==='/api/digital-market/products')return res.end(JSON.stringify(nearbyUi?nearbyStores.products:catalog));
    if(route==='/api/hostels')return res.end(JSON.stringify(hostels));
    if(route==='/api/digital-market/stores/browser-fixture-store')return res.end(JSON.stringify({store:{id:'browser-fixture-store',storeName:'Campus fixture store',description:'Read-only visual fixture for the theme audit.',category:'Education',location:'Campus',ratingCount:0},products}));
    if(user){
     const json=data=>res.end(JSON.stringify(data));
     const residentState=residentPinUi?referer.searchParams.get('visual_setup'):null;
     const fixtureRoom={id:'visual-active-room',roomKey:'PV101X',hostelName:'Visual fixture residence',blockName:'Pine',roomNumber:'101',assignedStudentName:'Visual resident',assignedStudentPhone:'+233241234567',managerName:'Visual manager'};
     const activeRooms=residentState==='resident-active'?[fixtureRoom]:[];
     const residentAccount=residentState&&residentState!=='resident-none'?{id:'visual-resident-context',active:residentState==='resident-active',residentPinLogin:true,status:residentState==='resident-active'?'active':residentState==='resident-closed'?'closed':'pending',email:user.email,name:'Visual resident',...fixtureRoom}:null;
     if(sellerWorkflows&&route==='/api/locations/suggestions')return json({places:[{label:'Ayeduase Gate, Kumasi, Ghana',latitude:6.6702,longitude:-1.5643},{label:'Ayeduase Road, Kumasi, Ghana',latitude:6.671,longitude:-1.565}]});
     if(sellerWorkflows&&route==='/api/locations/reverse')return json({places:[{label:'Map-selected campus location, Kumasi, Ghana',latitude:6.67,longitude:-1.56}]});
     if((sellerWorkflows||mobileUi)&&route==='/api/digital-market/inventory')return json(mobileUi?catalog:[...products,{...products[0],id:'browser-fixture-service',title:'Campus printing service',category:'Services',isService:true,serviceCategory:'Graphic Design & Printing',serviceLocationMode:'flexible',callLine:'+233241234567',isAvailable:true,stockQuantity:null}]);
     if(route==='/api/auth/appearance')return json({theme:savedAppearance.get(legalScene)||theme});
     if(route==='/api/auth/enrollments')return json([]);
     if(route==='/api/auth/account-access')return json({restrictions:[]});
     if(route==='/api/auth/maintenance-notice')return json({serverTime:new Date().toISOString(),notice:null});
     if(mobileUi&&route==='/api/companion')return json({preferences:{companion:'nova',responseStyle:'balanced',interests:'',reminders:true,aiEnabled:false},firstName:'Fixture',turns:[],available:true,provider:'cloudflare',providerName:'Cloudflare Workers AI'});
     if(route==='/api/student/my-profile')return json({user,rooms:activeRooms,roomKeyDetails:activeRooms[0]||null});
     if(route==='/api/student/my-rooms')return json({rooms:activeRooms});
     if(route==='/api/manager/my-hostel')return json({hostel:navUrgency?{id:'browser-fixture-residence-0',name:'Navigation fixture residence',location:'Local fixture',isApproved:navUrgency==='primary',blocksList:nearbyUi?nearbyStores.blocks:[]}:null});
     if(nearbyUi&&route==='/api/room-keys')return json(nearbyStores.keys);
     if(navUrgency&&route==='/api/issue-reports')return json([{id:'fixture-closed-maintenance-log',title:'Closed request with a new log',hostelId:'browser-fixture-residence-0',hostelName:'Navigation fixture residence',status:'Closed',reportedAt:new Date().toISOString(),category:'General',urgency:'Normal'}]);
     if(route==='/api/users/my-registered-accounts')return json({managerAccount:null,residentAccount,merchantAccount:null});
     if(route==='/api/users/manager-onboarding')return json({registrations:{managerAccount:null},policy:{googleManagerEnrollment:false},enrollments:[],access:{restriction:null,serverTime:new Date().toISOString()}});
     if(route==='/api/digital-market/status'&&referer.searchParams.has('visual_registration'))return json({application:{id:'theme-fixture-pending',status:'pending',accountStatus:referer.searchParams.get('visual_registration')==='restricted'?'restricted':'active',storeName:'Visual fixture store'},store:null});
     if(route==='/api/digital-market/status')return json({application:user.role==='merchant'?{id:'theme-fixture-application',status:'approved',storeName:'Visual fixture store'}:null,store:user.role==='merchant'?{id:'browser-fixture-store',storeName:'Visual fixture store',category:'Education',location:'Campus',description:'Read-only theme fixture.',subscriptionPlan:subscriptionUi?(['star','pro'].includes(referer.searchParams.get('visual_plan'))?referer.searchParams.get('visual_plan'):referer.searchParams.get('visual_plan')==='expired'?'pro':'default'):'default',...(subscriptionUi?{subscriptionStatus:'active',subscriptionExpiresAt:new Date(Date.now()+(referer.searchParams.get('visual_plan')==='expired'?-86400000:86400000)).toISOString()}:{}),ratingCount:0,setupCompleted:referer.searchParams.get('visual_setup')!=='pending',registrationFeePaid:true,username:'campus-fixture',phone:'+233241234567',phoneCountry:'GH',deliveryMode:'Campus Meetup'}:null});
     if(route==='/api/digital-market/my-orders')return json({orders:user.role==='user'?orders:[],nextCursor:null,hasMore:false,summary:{total:user.role==='user'?orders.length:0,pending:user.role==='user'&&orders.length?1:0,completed:user.role==='user'&&orders.length?1:0,revenue:0},customers:[]});
     if(mobileUi&&route==='/api/notifications'&&user.role==='merchant')return json([0,1].map(i=>({id:'fixture-notice-'+i,userId:user.id,scope:'market',title:i?'Store Profile Updated':'Listing Created',message:'Local visual fixture notification.',type:'info',read:true,date:'2026-10-30T19:18:30.392Z'})));
     if(route==='/api/admin/dashboard-directories')return json({residences:[],managerRestrictions:[],boardRequests:[],activities:[],digitalMarketApps:[],digitalMarketStores:[],paymentRecords:[],allUsersData:{totalUsers:0,breakdown:Object.fromEntries(['total','residents','managers','staff','officers','merchants','admins','others'].map(key=>[key,0])),users:[]}});
     if(route==='/api/customer-service/tickets')return json({tickets:[],members:[],hasMore:false,emailConfigured:true});
     if(route==='/api/staff')return json(user.role==='staff'?[{id:user.id,userId:user.id,name:user.name,email:user.email,role:'Maintenance',status:'Active',hostelName:'Visual fixture residence',...(mobileUi?{hostelId:'browser-fixture-residence-0',managerId:'theme-fixture-manager'}:{})}]:[]);
     if(['/api/admin-messages/pending','/api/notifications','/api/digital-market/inventory','/api/issue-reports','/api/staff/invitations','/api/staff-bargains','/api/board-requests','/api/activities','/api/room-keys','/api/manager-verifications','/api/admin/verification-inspections','/api/verification-teams','/api/verification-team/my-inspections','/api/digital-market/conversations'].includes(route))return json([]);
    }
    res.writeHead(404);return res.end('{}');
   }
   let relative=decodeURIComponent(route).replace(/^\/+/,''),file=path.resolve(root,relative||'index.html');
   if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
   let data;try{data=await fs.readFile(file);}catch{res.writeHead(404);return res.end('No test file');}
   const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.otf':'font/otf','.ttf':'font/ttf','.woff2':'font/woff2','.webmanifest':'application/manifest+json'}[path.extname(file)]||'application/octet-stream';
   res.setHeader('Content-Type',mime);res.setHeader('Cache-Control','no-store');res.end(data);
  }catch{res.writeHead(500);res.end('Fixture server error');}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const origin='http://127.0.0.1:'+server.address().port,profile=await fs.mkdtemp('/tmp/pinevela-public-theme-browser-');
 const chrome=spawn(process.env.CHROME_BIN||'/snap/chromium/current/usr/lib/chromium-browser/chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-pipe',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe','pipe','pipe']});
 let sequence=0,buffer='',stderr='',scenario='startup',seedScript,debug=async()=>({}),debugCapture=async()=>{};const pending=new Map(),checks=[],screenshots=[],exceptions=[],fileChooserEvents=[];
 chrome.stderr.on('data',c=>{stderr=(stderr+c).slice(-1500)});
 chrome.stdio[4].on('data',c=>{buffer+=c;let end;while((end=buffer.indexOf('\0'))>=0){const raw=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!raw)continue;const m=JSON.parse(raw);if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.method==='Page.fileChooserOpened')fileChooserEvents.push(m.params);const p=pending.get(m.id);if(!p)continue;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error(method+' timed out: '+stderr))},20000);pending.set(id,{resolve,reject,timer});chrome.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');});
 try{
  const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const command=(method,params)=>send(method,params,sessionId);
  const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  debug=()=>evaluate('({url:location.href,title:document.title,text:document.body?.innerText.slice(0,1200),root:!!document.getElementById("root"),scripts:[...document.scripts].map(s=>s.src).filter(Boolean),dataset:{...document.documentElement.dataset}})');
  const until=async(expression,label,timeout=15000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(expression))return;await pause(50);}throw new Error(label+' did not settle');};
  const os=async dark=>{await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:dark?'dark':'light'},{name:'prefers-reduced-motion',value:'reduce'}]});await pause(80);};
  const viewport=(width,height=900)=>command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<640});
  const load=async(route,preference,systemDark=false,visual={})=>{
   if(seedScript)await command('Page.removeScriptToEvaluateOnNewDocument',{identifier:seedScript});
   const seed=Date.now()+'-'+Math.random();
   const googleReturnSeed=googleReturnUi?(visual.mobileReturn?"sessionStorage.setItem('pinevela:mobile-handoff-active','1');":"sessionStorage.removeItem('pinevela:mobile-handoff-active');"):"";
   seedScript=(await command('Page.addScriptToEvaluateOnNewDocument',{source:`if(document.documentURI.startsWith(${JSON.stringify(origin+'/')})){${androidLayout?.bridgeSource||''}${googleReturnSeed}if(sessionStorage.getItem('public-theme-case')!==${JSON.stringify(seed)}){localStorage.clear();${preference?`localStorage.setItem('pinevela:appearance',${JSON.stringify(preference)});`:''}sessionStorage.setItem('public-theme-case',${JSON.stringify(seed)})}}`})).identifier;
   await os(systemDark);const url=new URL(route,origin);url.searchParams.set('scene',seed);if(googleReturnUi)url.searchParams.set('visual_return',visual.mobileReturn||'none');if(visual.signupResume)url.searchParams.set('visual_signup_resume',visual.signupResume==='cooldown'?'cooldown':'1');if(visual.role){url.searchParams.set('visual_role',visual.role);url.searchParams.set('visual_theme',preference||'system');if(visual.terms)url.searchParams.set('visual_terms',visual.terms);if(visual.setup)url.searchParams.set('visual_setup',visual.setup);if(visual.registration)url.searchParams.set('visual_registration',visual.registration);if(visual.plan)url.searchParams.set('visual_plan',visual.plan);if(visual.prices)url.searchParams.set('visual_prices',visual.prices);}await command('Page.navigate',{url:url.href});
   await until(`location.search===${JSON.stringify(url.search)}&&document.readyState==='complete'`,'New document');
   const selector=visual.selector||(route.includes('privacy.html')||route.includes('terms.html')||route.startsWith('/legal/terms-')?'.document':route.includes('/faq')?'input[type=search]':route.includes('/help')?'textarea':route.includes('/why-us')?'.why-us-pair':route.includes('/pinemarket/stores/')?'[data-market-storefront]':route.includes('/pinemarket')?'[data-listing-id]':route.includes('/pineresidence')?'[data-public-residence] h1':route.includes('/support-invitation')?'.support-surface h1':'.landing-peak-hero');
   await until(`!!document.querySelector(${JSON.stringify(selector)})`,'Public page mounts');await pause(180);
  };
  const capture=async(name,clip)=>{const shot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:!!clip,...(clip?{clip}:{})});const file=path.join(output,name+'.png');await fs.writeFile(file,Buffer.from(shot.data,'base64'));screenshots.push(file);};
  debugCapture=capture;
  const checkBrand=async theme=>{
   const brand=await evaluate(`(async()=>{await document.fonts.ready;return [...document.querySelectorAll('.pinevela-wordmark')].map(e=>{const p=e.querySelector('.pine-label'),v=e.querySelector('.vela-label'),s=getComputedStyle(e);return {text:e.textContent,font:s.fontFamily,fontReady:document.fonts.check('800 20px "PineVela Wordmark"'),pine:getComputedStyle(p).color,vela:getComputedStyle(v).color,velaFill:getComputedStyle(v).webkitTextFillColor,background:getComputedStyle(v).backgroundColor,inverse:e.dataset.brandSurface==='inverse'}})})()`);
   assert(brand.length,'A shared PineVela wordmark is rendered');
   for(const b of brand){assert.equal(b.text,'PineVela');assert(b.font.includes('PineVela Wordmark')&&b.fontReady,'The shared local wordmark font loads');assert.equal(b.pine,'rgb(25, 25, 25)');assert.equal(b.background,'rgba(0, 0, 0, 0)');assert.equal(b.vela,theme==='dark'||b.inverse?'rgb(255, 214, 10)':'rgb(25, 25, 25)');assert.equal(b.velaFill,b.vela);}
   const toggle=await evaluate(`(()=>{const e=document.querySelector('.theme-toggle-thumb');return e?{paint:getComputedStyle(e).backgroundImage,color:getComputedStyle(e).color}:null})()`);
   if(toggle){assert(toggle.paint.includes(theme==='light'?'rgb(0, 53, 102)':'rgb(255, 214, 10)'),'Selected sun is blue; selected moon is yellow');assert.equal(toggle.color,theme==='light'?'rgb(255, 255, 255)':'rgb(0, 29, 61)');}
  };
  const checkOnboardingActions=async theme=>{
   const actions=await evaluate(`(()=>{const seen=new Set();return [...document.querySelectorAll('[data-pv-onboarding],.onboarding-fields')].flatMap(root=>[...root.querySelectorAll('button,a[href]')]).filter(e=>{if(seen.has(e)||!e.getClientRects().length)return false;seen.add(e);return e.matches('.pv-onboarding-action,.pv-primary-action')||[...e.classList].some(c=>/^bg-blue-[5-9]00$|^from-(blue|indigo)-[5-9]00$/.test(c))}).map(e=>({text:e.textContent.trim(),paint:getComputedStyle(e).backgroundImage,color:getComputedStyle(e).color}))})()`);
   for(const a of actions){assert(a.paint.includes(theme==='light'?'rgb(0, 53, 102)':'rgb(255, 195, 0)'),a.text+' follows its onboarding theme');assert.equal(a.color,theme==='light'?'rgb(255, 255, 255)':'rgb(0, 29, 61)',a.text+' has readable action ink');}
   return actions.length;
  };
  const contrast=(a,b)=>{const l=v=>v.slice(0,3).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);const x=l(a),y=l(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
  const color=s=>(s.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
  const composite=(paint,base)=>paint.slice(0,3).map((c,i)=>c*(paint[3]??1)+base[i]*(1-(paint[3]??1)));
  const glassGeometry=new Map();
  const sceneFilter=process.env.PINEVELA_THEME_SCENES?new RegExp(process.env.PINEVELA_THEME_SCENES):null;
  const test=async(name,run)=>{if(sceneFilter&&!sceneFilter.test(name))return;scenario=name;await run();checks.push(name);console.log('PASS '+name);};
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable');
  await command('Network.setBlockedURLs',{urls:mobileUi||subscriptionUi||catalogCacheUi||managerFixUi?['https://*']:['https://fonts.googleapis.com/*','https://fonts.gstatic.com/*','https://tile.openstreetmap.org/*']});
  const marketGeometry=()=>evaluate(`(()=>{const rect=e=>{if(!e||!e.getClientRects().length)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}},home=document.getElementById('home-market-section');return{viewport:{width:innerWidth,height:innerHeight},switcher:rect(document.querySelector('.user-catalog-switcher')),header:rect(home?.querySelector('.user-market-header')),toolbar:rect(home?.querySelector('.marketplace-filter-bar')),search:rect(home?.querySelector('input[aria-label="Search marketplace items"]')),sort:rect(home?.querySelector('.marketplace-filter-controls .market-sort-control')),count:rect(home?.querySelector('.market-item-count')),categories:rect(home?.querySelector('.market-categories')),firstCard:rect(home?.querySelector('[data-listing-id]')),secondCard:rect(home?.querySelectorAll('[data-listing-id]')[1]),merchant:rect(home?.querySelector('[data-registration-button=merchant]')),nearby:rect(home?.querySelector('.user-nearby-services')),overflow:document.documentElement.scrollWidth>innerWidth}})()`);
  const primaryMarket=async(width,theme)=>{
   await viewport(width);await load('/#/user/dashboard',theme,theme==='light',{role:'user',selector:'.user-dashboard [data-dashboard-view]'});
   await until(`document.querySelectorAll('#home-market-section [data-listing-id]').length===${catalog.length}`,'Real dashboard catalog mounts');
   if(await evaluate("!!document.querySelector('dialog[aria-label=\"Welcome to PineVela\"]')"))await evaluate("document.querySelector('dialog[aria-label=\"Welcome to PineVela\"] [aria-label=\"Close dialog\"]').click()");
   await until("!document.querySelector('dialog[open]')",'Welcome closes without an API write');await evaluate('document.fonts.ready.then(()=>true)');await pause(300);
  };
  const navigationClearance=[];
  for(const width of [320,390,768,1023])for(const theme of ['light','dark'])await test(`${width}px ${theme} mobile market navigation spacing`,async()=>{
   await primaryMarket(width,theme);const before=await marketGeometry();
   await evaluate("localStorage.setItem('pinevela_navigation_layout','top')");await command('Page.reload');
   await until("document.querySelector('.user-dashboard')?.dataset.navigationLayout==='compact'&&!!document.querySelector('#home-market-section [data-listing-id]')",'Legacy compact preference on mobile');
   const after=await marketGeometry();assert.equal(after.switcher.y,before.switcher.y);assert.equal(after.firstCard.y,before.firstCard.y);assert.equal(after.overflow,false);
   assert(await evaluate("document.querySelector('.user-dashboard-header').getBoundingClientRect().height>0&&document.querySelector('.pv-compact-sidebar').getBoundingClientRect().height===0"),'Mobile header remains the navigation');
  });
  if(process.env.PINEVELA_MARKET_BASELINE==='1'){
   const baseline={};
   for(const width of [320,390,430,640,1024,1440])for(const theme of ['light','dark'])await test(`${width}px ${theme} market layout baseline`,async()=>{
    await primaryMarket(width,theme);baseline[`${width}-${theme}`]=await marketGeometry();await capture(`${width}-${theme}-market-before`);
   });
   await fs.writeFile('/tmp/pinevela-mobile-market-before-20261028.json',JSON.stringify(baseline,null,2)+'\n');
  }
  if(process.env.PINEVELA_MARKET_AUDIT==='1'){
   const baseline=JSON.parse(await fs.readFile('/tmp/pinevela-mobile-market-before-20261028.json','utf8')),measured={};
   for(const width of [320,390,430,640,1024,1440])for(const theme of ['light','dark'])await test(`${width}px ${theme} market layout audit`,async()=>{
    await primaryMarket(width,theme);const now=await marketGeometry(),before=baseline[`${width}-${theme}`];measured[`${width}-${theme}`]=now;
    assert.equal(now.overflow,false);assert(now.firstCard&&now.secondCard,'Actual fixture items render');
    assert.equal(now.header,null,'The repeated intro/action block is removed');assert.equal(now.sort,null);assert.equal(now.count,null);assert.equal(now.merchant,null);
    assert.equal(now.toolbar.height,44,'Search and Filters share one compact row');assert(now.search.height>=44);
    assert.equal(now.firstCard.y,now.secondCard.y,'At least two cards fit on the first row');assert.equal(now.firstCard.height,before.firstCard.height,'Product pictures and card dimensions stay intact');
    assert(before.firstCard.y-now.firstCard.y>=150,'Cards gain at least 150px of viewport space at every width');
    if(width<1024)assert(now.firstCard.bottom<await evaluate("document.querySelector('.user-bottom-navigation').getBoundingClientRect().top"),'The whole first row fits above bottom navigation');
    else assert(now.firstCard.bottom<900,'The first desktop row fits in view');
    assert.equal(await evaluate("document.querySelector('#home-market-section .market-price-toggle').innerText.trim()"),'Filters');
    assert(await evaluate("(()=>{const row=document.querySelector('#home-market-section .market-categories');return [...row.querySelectorAll('button')].every(b=>b.getBoundingClientRect().y===row.firstElementChild.getBoundingClientRect().y)})()"),'Category chips stay on one row');
    if(width<640)assert(await evaluate("(()=>{const row=document.querySelector('#home-market-section .market-categories');return row.scrollWidth>row.clientWidth})()"),'Narrow categories scroll horizontally');
    await capture(`${width}-${theme}-market-after`);
   });
   if(Object.keys(measured).length)await fs.writeFile('/tmp/pinevela-mobile-market-after-20261028.json',JSON.stringify(measured,null,2)+'\n');
   const setValue=(selector,value,type='input')=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${type==='change'?'HTMLSelectElement':'HTMLInputElement'}.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(${JSON.stringify(type)},{bubbles:true}));})()`);
   const key=async(key,code,virtualKey)=>{await command('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:virtualKey,...(code==='Enter'?{text:'\r'}:{})});await command('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:virtualKey});};
   for(const width of [320,390,430,1440])for(const theme of ['light','dark'])await test(`${width}px ${theme} market interaction`,async()=>{
    await primaryMarket(width,theme);
    const opener='#home-market-section .market-price-toggle',sheet='dialog[aria-label="Marketplace filters"]';
    await evaluate(`document.querySelector(${JSON.stringify(opener)}).focus()`);await key(' ','Space',32);await until(`!!document.querySelector('${sheet}[open]')`,'Keyboard opens combined filters');
    assert(await evaluate(`document.querySelector('${sheet} [aria-label="Sort marketplace"]').getClientRects().length>0`));assert(await evaluate(`!!document.querySelector('${sheet} [aria-label="Minimum price"]')`));
    const panel=await evaluate(`(()=>{const e=document.querySelector('${sheet}>section'),r=e.getBoundingClientRect(),h=e.querySelector('h2'),p=e.querySelector('.market-filter-footer p');return{width:r.width,height:r.height,y:r.y,bottom:r.bottom,viewport:innerWidth,screen:innerHeight,heading:getComputedStyle(h).color,text:getComputedStyle(p).color,background:getComputedStyle(document.documentElement).backgroundColor,panelBackground:getComputedStyle(e).backgroundColor}})()`);
    if(theme==='light')assert.equal(panel.panelBackground,'rgb(255, 255, 255)','The entire light sheet has a readable white surface');
    assert(panel.width<=panel.viewport&&panel.height<panel.screen);if(width>=640)assert(Math.abs(panel.y+panel.height/2-panel.screen/2)<1,'Desktop filters are centered');else assert(Math.abs(panel.screen-panel.bottom-10)<1,'Phone filters use a bottom sheet');assert(contrast(color(panel.heading),color(panel.background))>=4.5);assert(contrast(color(panel.text),color(panel.background))>=4.5);
    await capture(`${width}-${theme}-combined-filters`);
    await setValue(`${sheet} [aria-label="Sort marketplace"]`,'price-desc','change');
    await until("document.querySelector('#home-market-section [data-listing-id]')?.dataset.listingId==='browser-fixture-item-2'",'Sorting updates actual cards');
    await evaluate(`document.querySelector('${sheet} [aria-label="GHS 100 to 500"]').click()`);await until(`document.querySelector('${sheet} [role=status]')?.textContent==='0 matching items'`,'Price selection updates result count');
    await evaluate(`document.querySelector('${sheet} .market-filter-footer button').click()`);await until(`!document.querySelector('${sheet}[open]')`,'Show results closes sheet');
    assert(await evaluate("document.querySelector('#home-market-section').innerText.includes('No items match your criteria')"));
    await evaluate(`document.querySelector(${JSON.stringify(opener)}).click()`);await until(`!!document.querySelector('${sheet}[open]')`,'Filters reopen');
    assert.equal(await evaluate(`document.querySelector('${sheet} [aria-label="Sort marketplace"]').value`),'price-desc','Sort persists while sheet is closed');
    await evaluate(`document.querySelector('${sheet} [aria-label="Reset price filters"]').click()`);await until(`document.querySelector('${sheet} [role=status]')?.textContent==='3 matching items'`,'Reset restores available products');
    await evaluate(`document.querySelector('${sheet} .market-filter-footer button').focus()`);await key('Tab','Tab',9);assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Close marketplace filters','Keyboard focus stays in the sheet');
    await key('Escape','Escape',27);await until(`!document.querySelector('${sheet}[open]')`,'Escape closes sheet');assert(await evaluate(`document.activeElement===document.querySelector(${JSON.stringify(opener)})`),'Focus returns to Filters');
    assert.equal(await evaluate("document.querySelector('#home-market-section .market-price-toggle').dataset.filtered"),'true','Non-default sorting remains indicated');
    await setValue('#home-market-section [aria-label="Search marketplace items"]','headphones');await until("document.querySelectorAll('#home-market-section [data-listing-id]').length===1",'Search keeps working');await evaluate("document.querySelector('#home-market-section [aria-label=\"Clear search\"]').click()");await until("document.querySelectorAll('#home-market-section [data-listing-id]').length===3",'Clear restores cards');
    await evaluate("[...document.querySelectorAll('#home-market-section .market-categories button')].find(b=>b.textContent==='Services').click()");await until("!!document.querySelector('.market-nearby-shortcut')",'Nearby appears in Services');
    assert(await evaluate("document.querySelector('.market-nearby-shortcut').getClientRects().length>0"));await evaluate("document.querySelector('.market-nearby-shortcut').click()");await until("!!document.querySelector('dialog[aria-label=\"Services near you\"] .nearby-services-screen')",'Original map finishes loading');await evaluate("document.querySelector('[aria-label=\"Close services map\"]').click()");
    const optionsSelector=width>=1024?'#user-dashboard-sidebar [title="Options Tab"]':'.user-bottom-navigation [data-navigation-id=options]';
    assert(await evaluate(`document.querySelector(${JSON.stringify(optionsSelector)}).getClientRects().length>0`),'Options entry is visible');await evaluate(`document.querySelector(${JSON.stringify(optionsSelector)}).click()`);await until("!!document.querySelector('.user-merchant-settings [data-registration-button=merchant]:not(:disabled)')",'Merchant entry in Options loads');
    const merchant=await evaluate("(()=>{const b=document.querySelector('.user-merchant-settings [data-registration-button=merchant]'),s=getComputedStyle(b);return{visible:b.getClientRects().length>0,label:b.innerText.trim(),status:b.dataset.registrationStatus,background:s.backgroundImage,sheen:getComputedStyle(b,'::after').animationName}})()");
    assert.equal(merchant.visible,true);assert.equal(merchant.label,'Become a Merchant');assert.equal(merchant.status,'unregistered');assert(merchant.background.includes('gradient'),'Gold merchant styling is preserved');await capture(`${width}-${theme}-merchant-options`);
    await evaluate("document.querySelector('.user-merchant-settings [data-registration-button=merchant]').click()");await until("!!document.querySelector('dialog[open]')",'Existing seller registration opens');assert(await evaluate("document.querySelector('dialog[open]').innerText.toLowerCase().includes('merchant')||document.querySelector('dialog[open]').innerText.toLowerCase().includes('seller')"),'The same seller flow is reachable');
   });
   for(const status of ['pending','restricted'])for(const theme of ['light','dark'])await test(`${theme} merchant registration status in Options: ${status}`,async()=>{
    await viewport(390);await load('/#/user/dashboard',theme,false,{role:'user',registration:status,selector:'.user-dashboard [data-dashboard-view]'});await until("!!document.querySelector('dialog[aria-label=\"Welcome to PineVela\"]')",'Welcome mounts');await evaluate("document.querySelector('dialog[aria-label=\"Welcome to PineVela\"] [aria-label=\"Close dialog\"]').click()");
    await evaluate("document.querySelector('.user-bottom-navigation [data-navigation-id=options]').click()");await until(`document.querySelector('.user-merchant-settings [data-registration-button=merchant]')?.dataset.registrationStatus===${JSON.stringify(status)}`,'Actual registration status appears');
    assert.equal(await evaluate("document.querySelector('.user-merchant-settings [data-registration-button=merchant]').innerText.trim()"),status==='pending'?'Pending Approval':'Account Restricted');
    assert.equal(await evaluate("document.querySelector('.user-merchant-settings [data-registration-button=merchant]').classList.contains('pv-merchant-join')"),false,'A status control is not shown as an unregistered application');
   });
  }
  if(process.env.PINEVELA_AUTH_MOTION==='1'){
   const typeInput=(label,value)=>evaluate(`(()=>{const e=document.querySelector('input[aria-label=${JSON.stringify(label)}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
   const switchAuth=async(tab)=>evaluate(`new Promise(resolve=>{const b=document.querySelectorAll('.login-mode-toggle button')[${tab==='register'?1:0}];b.focus();b.click();requestAnimationFrame(()=>{const e=document.querySelector('.login-auth-card form'),s=getComputedStyle(e);resolve({name:s.animationName,duration:s.animationDuration,iterations:s.animationIterationCount,opacity:s.opacity,transform:s.transform,frames:e.getAnimations().flatMap(a=>a.effect.getKeyframes().map(f=>({opacity:f.opacity,transform:f.transform,x:f.transform?new DOMMatrixReadOnly(f.transform).m41:0}))),forms:document.querySelectorAll('.login-auth-card form').length,mode:document.querySelector('.login-auth-card').dataset.activeTab});})})`);
   for(const width of [320,390,1440])for(const theme of ['light','dark'])for(const reduced of [false,true])await test(`${width}px ${theme} login/signup motion ${reduced?'reduced':'normal'}`,async()=>{
    await viewport(width);await load('/#/login',theme,theme==='light',{selector:'.login-credentials-form'});
    await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme==='light'?'dark':'light'},{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});await evaluate('document.fonts.ready.then(()=>true)');await pause(420);
    const reads=apiRequests.length;await typeInput('Email address','visual-fixture@pinevela.invalid');
    const signup=await switchAuth('register');assert.equal(signup.mode,'register');assert.equal(signup.forms,1);
    assert.equal(signup.name,reduced?'none':'pv-login-signup-in');if(!reduced){assert.equal(parseFloat(signup.duration),.19);assert.equal(signup.iterations,'1');assert(signup.frames.some(f=>f.x===6),'Signup enters with a small right-side offset: '+JSON.stringify(signup));}
    await until("getComputedStyle(document.querySelector('.login-signup-form')).opacity==='1'&&!document.querySelector('.login-signup-form').getAnimations().some(a=>a.playState==='running')",'Signup transition finishes');
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Animated fields stay inside the viewport');await typeInput('Your Full Name','Local visual fixture');
    const login=await switchAuth('login');assert.equal(login.name,reduced?'none':'pv-login-signin-in');assert.equal(login.mode,'login');assert.equal(login.forms,1);if(!reduced)assert(login.frames.some(f=>f.x===-6),'Login enters from the opposite side');
    await until("getComputedStyle(document.querySelector('.login-credentials-form')).opacity==='1'&&!document.querySelector('.login-credentials-form').getAnimations().some(a=>a.playState==='running')",'Login transition finishes');assert.equal(await evaluate("document.querySelector('input[aria-label=\"Email address\"]').value"),'visual-fixture@pinevela.invalid','Login draft survives form switching');
    await switchAuth('register');await until("!!document.querySelector('input[aria-label=\"Your Full Name\"]')",'Signup returns');assert.equal(await evaluate("document.querySelector('input[aria-label=\"Your Full Name\"]').value"),'Local visual fixture','Signup draft survives form switching');
    await evaluate("(()=>{const b=document.querySelectorAll('.login-mode-toggle button');b[0].click();b[1].click();b[0].click()})()");await until("document.querySelector('.login-auth-card').dataset.activeTab==='login'",'Rapid switches settle');assert.equal(await evaluate("document.querySelectorAll('.login-auth-card form').length"),1,'Rapid switches leave one active form');
    assert.equal(apiRequests.length,reads,'Changing auth tabs makes no API or CAPTCHA requests');
    if(width<1024)assert.equal(await evaluate("getComputedStyle(document.querySelector('.login-auth-card')).animationName"),'none','The phone glass card stays still');
    if(reduced)assert.equal(await evaluate("getComputedStyle(document.querySelector('.login-mode-toggle'),'::before').transitionDuration"),'0s','Reduced motion also disables selector travel');
    await pause(220);await capture(`${width}-${theme}-auth-${reduced?'reduced':'animated'}`);
   });
  }
  const publicRoutes=[['landing','/#/'],['market','/#/pinemarket'],['residence','/#/pineresidence'],['store','/#/pinemarket/stores/browser-fixture-store'],['why-us','/#/why-us'],['support-invitation','/#/support-invitation'],['faq','/#/faq?from=/'],['help','/#/help?from=/'],['privacy','/privacy.html'],['terms','/terms.html'],['versioned-terms','/legal/terms-2026-11-05.html']];
  for(const width of [320,390,1440])for(const theme of ['light','dark'])for(const [name,route]of publicRoutes){
   await test(`${width}px ${theme} ${name}`,async()=>{
    await viewport(width);await load(route,theme,theme==='light');
    const state=await evaluate(`(()=>{const h=document.querySelector('h1'),p=document.querySelector('.landing-peak-copy p,.support-intro>p:nth-of-type(2),.document p,main p'),style=e=>getComputedStyle(e);return{theme:document.documentElement.dataset.theme,overflow:document.documentElement.scrollWidth>innerWidth,headings:document.querySelectorAll('h1').length,mains:document.querySelectorAll('main').length,body:style(document.documentElement).backgroundColor,ink:style(h).color,muted:style(p).color,chrome:document.querySelector('meta[name="theme-color"]').content,systemButtons:document.querySelectorAll('.theme-system-choice').length,publicSwitches:document.querySelectorAll('[role=switch]').length,invalidImages:[...document.images].filter(i=>i.complete&&!i.naturalWidth&&i.loading!=='lazy').length}})()`);
    assert.equal(state.theme,theme);assert.equal(state.overflow,false);assert.equal(state.headings,1);assert.equal(state.mains,1);assert.equal(state.systemButtons,0,'No System button on public pages');
    await checkBrand(theme);await checkOnboardingActions(theme);
    assert.equal(state.chrome,theme==='light'?'#ffffff':'#001d3d');assert.equal(state.invalidImages,0);
    assert.equal(await evaluate("new URL(document.querySelector('link[rel=icon]').href).pathname"),'/icons/pinevela-192.png','Homepage and policies advertise the same PNG favicon');
    assert(contrast(color(state.ink),color(state.body))>=4.5,'Heading contrast');assert(contrast(color(state.muted),color(state.body))>=4.5,'Body/supporting contrast');
    if(name==='privacy'||name==='terms'||name==='versioned-terms'){
     const logo=await evaluate("(async()=>{const i=document.querySelector('.brand img');await i.decode();const c=document.createElement('canvas');c.width=64;c.height=64;const x=c.getContext('2d');x.drawImage(i,0,0,64,64);return{path:new URL(i.src).pathname,corners:[[0,0],[63,0],[0,63],[63,63]].map(([a,b])=>x.getImageData(a,b,1,1).data[3])}})()");
     assert.equal(logo.path,'/store-covers/pinevela-logo.svg','Policies use the same mascot as the app');assert(logo.corners.every(alpha=>alpha===0),'The legal-page mascot has transparent corners');
     assert(await evaluate("[...document.querySelectorAll('header a,footer a')].filter(a=>a.textContent==='Contact support').every(a=>a.getAttribute('href')==='/#/help')"),'Policy Contact support links stay inside PineVela');
     assert(await evaluate("document.querySelector('.document').textContent.includes('PineVela Ghana')&&!!document.querySelector('a[href=\"mailto:pinevela@pinevela.app\"]')&&!/Oppong Manu Andy|and(?:y)?heller2k@gmail\\.com/i.test(document.body.textContent)"),'Current policies use the updated operator/contact');
    }
    if(name==='help'){
     assert(await evaluate("!!document.querySelector('a[href=\"mailto:pinevela@pinevela.app\"]')&&!document.querySelector('a[href*=\"heller2k\"]')"),'Help email uses the public support mailbox');
    }
    if(name==='landing'){
     assert.equal(await evaluate("document.body.textContent.includes('Your campus, connected')"),false,'The removed hero label is absent');
     assert.equal(state.publicSwitches,1);const action=await evaluate("(()=>{const s=getComputedStyle(document.querySelector('.landing-peak-cta'));return{color:s.color,image:s.backgroundImage}})()");
     assert.equal(action.color,theme==='light'?'rgb(255, 255, 255)':'rgb(0, 29, 61)');
     const stops=[...action.image.matchAll(/rgb\(([^)]+)\)/g)].map(m=>m[1].split(',').map(Number));assert(stops.length>=2);for(const stop of stops)assert(contrast(color(action.color),stop)>=4.5);
     if(width<1024){await evaluate("document.querySelector('.public-header-menu-toggle').click()");assert(await evaluate("document.querySelector('[role=switch]').getBoundingClientRect().height>=44"));assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));await evaluate("document.querySelector('.public-header-menu-toggle').click()");}
     const glass=await evaluate(`(()=>{const e=document.getElementById('benefits'),s=getComputedStyle(e),r=e.getBoundingClientRect();return{image:s.backgroundImage,filter:s.backdropFilter,heading:getComputedStyle(e.querySelector('h2')).color,eyebrow:getComputedStyle(e.querySelector('.company-eyebrow')).color,geometry:{width:r.width,height:r.height},clip:{x:r.x,y:r.y+scrollY,width:r.width,height:r.height,scale:1},cards:[...e.querySelectorAll('.landing-benefit')].map(c=>({background:getComputedStyle(c).backgroundColor,heading:getComputedStyle(c.querySelector('h3')).color,text:getComputedStyle(c.querySelector('p')).color}))}})()`);
     const paints=[...glass.image.matchAll(/rgba?\(([^)]+)\)/g)].map(m=>m[1].split(',').map(Number));
     assert(paints.length>=2&&paints.every(p=>p.length===4&&p[3]>0&&p[3]<1),'The whole benefits section uses translucent glass');assert(glass.filter.includes('blur('));assert.equal(glass.cards.length,3);
     for(const paint of paints){assert(!(paint[0]>180&&paint[1]>140&&paint[2]<100),'No yellow section backdrop');const surface=composite(paint,color(state.body));assert(contrast(color(glass.heading),surface)>=4.5);assert(contrast(color(glass.eyebrow),surface)>=4.5);for(const c of glass.cards){const fill=(c.background.match(/[\d.]+/g)||[]).map(Number);assert(fill.length===4&&fill[3]>0&&fill[3]<1,'Benefit cards stay translucent');const panel=composite(fill,surface);assert(contrast(color(c.heading),panel)>=4.5);assert(contrast(color(c.text),panel)>=4.5);}}
     if(theme==='light')glassGeometry.set(width,glass.geometry);else for(const key of ['width','height'])assert(Math.abs(glass.geometry[key]-glassGeometry.get(width)[key])<1,'Glass section geometry is shared by both themes');
     assert.equal(await evaluate("(async()=>{const i=document.querySelector('.landing-peak-image');await i.decode();const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const x=c.getContext('2d');x.drawImage(i,0,0);return x.getImageData(0,0,1,1).data[3]})()"),0,'The hero image has a genuinely transparent background');
     if(width===390||width===1440)await capture(`${width}-${theme}-benefits-glass`,glass.clip);
     const chapters=await evaluate(`(()=>{const style=e=>getComputedStyle(e);return [...document.querySelectorAll('.company-chapter')].map(e=>({id:e.id,background:style(e).backgroundColor,image:style(e).backgroundImage,eyebrow:style(e.querySelector('.company-eyebrow')).color,heading:style(e.querySelector('h2')).color,text:style(e.querySelector('.company-paragraphs p:last-child')).color}))})()`);
     assert.equal(chapters.length,4);
     for(const chapter of chapters){const stops=[...chapter.image.matchAll(/rgba?\(([^)]+)\)/g)].map(m=>m[1].split(',').map(Number));if(!stops.length)stops.push(color(chapter.background));for(const surface of stops)for(const key of ['eyebrow','heading','text'])assert(contrast(color(chapter[key]),surface)>=4.5,chapter.id+' '+key+' contrast');if(theme==='light'&&['story-about-us','story-partner-with-us'].includes(chapter.id)){assert.equal(chapter.eyebrow,'rgb(255, 255, 255)');assert.equal(chapter.heading,'rgb(255, 255, 255)');}}
     if(width===1440){await evaluate("document.getElementById('story-about-us').scrollIntoView()");await capture(`${width}-${theme}-about-us-contrast`);await evaluate("document.getElementById('story-partner-with-us').scrollIntoView()");await capture(`${width}-${theme}-partner-contrast`);await evaluate('scrollTo(0,0)');}
    }
    if(name==='why-us'){
     const panels=await evaluate(`[...document.querySelectorAll('.why-us-pair>div')].map(e=>({image:getComputedStyle(e).backgroundImage,background:getComputedStyle(e).backgroundColor,colors:[...e.querySelectorAll('p')].map(p=>getComputedStyle(p).color)}))`);assert.equal(panels.length,28);
     for(const panel of panels){const stops=[...panel.image.matchAll(/rgba?\(([^)]+)\)/g)].map(m=>m[1].split(',').map(Number));if(!stops.length)stops.push(color(panel.background));for(const surface of stops)for(const text of panel.colors)assert(contrast(color(text),surface)>=4.5,'Comparison panel contrast');}
    }
    if(name==='market'||name==='store')assert.equal(await evaluate("document.querySelectorAll('[data-listing-id]').length"),3,'Fixture products actually render');
    if(width===390||width===1440)await capture(`${width}-${theme}-${name}`);
   });
  }
  const dialogContrast=async label=>{
   await until(`!!document.querySelector('dialog[open][aria-label=${JSON.stringify(label)}]')`,'Dialog opens: '+label);
   const data=await evaluate(`(()=>{const d=document.querySelector('dialog[open][aria-label=${JSON.stringify(label)}]'),panel=d.firstElementChild,s=getComputedStyle(panel);return{scrim:getComputedStyle(d).backgroundColor,background:s.backgroundColor,image:s.backgroundImage,width:panel.getBoundingClientRect().width,viewport:innerWidth,heading:getComputedStyle(panel.querySelector('h2,h3')).color,text:[...panel.querySelectorAll('p.text-slate-500,p.text-slate-600,p.text-slate-700,.pv-install-intro')].map(p=>getComputedStyle(p).color),canvas:getComputedStyle(document.documentElement).backgroundColor}})()`);
   assert(data.width<=data.viewport,'Dialog fits viewport');
   const scrim=(data.scrim.match(/[\d.]+/g)||[]).map(Number);assert(scrim.length===4&&scrim[3]>0&&scrim[3]<1,'The dialog scrim stays translucent');
   const stops=[...data.image.matchAll(/rgba?\(([^)]+)\)/g)].map(m=>m[1].split(',').map(Number));if(!stops.length)stops.push((data.background.match(/[\d.]+/g)||[]).map(Number));
   for(const stop of stops){const surface=composite(stop,color(data.canvas));for(const ink of [data.heading,...data.text])assert(contrast(color(ink),surface)>=4.5,label+' text contrast');}
  };
  for(const width of [390,1440])for(const theme of ['light','dark'])await test(`${width}px ${theme} public dialogs and selected filters`,async()=>{
   await viewport(width);await load('/#/pinemarket',theme);
   await evaluate("document.querySelector('.market-price-toggle').click()");await until("!!document.querySelector('.market-price-panel')",'Price controls open');
   const pill=await evaluate("(()=>{const e=document.querySelector('.market-categories [aria-pressed=true]'),s=getComputedStyle(e);return{ink:s.color,image:s.backgroundImage}})()");
   for(const stop of [...pill.image.matchAll(/rgb\(([^)]+)\)/g)].map(m=>m[1].split(',').map(Number)))assert(contrast(color(pill.ink),stop)>=4.5,'Selected category is legible');
   await evaluate("document.querySelector('[aria-label=\"Inspect Study essentials\"]').click()");await dialogContrast('Inspect Study essentials');await capture(`${width}-${theme}-product-inspection`);
   await evaluate("document.querySelector('[aria-label=\"Enlarge Study essentials\"]').click()");await until("!!document.querySelector('dialog[open][data-image-viewer]')",'Product photograph opens');
   const gallery=await evaluate("(()=>{const d=document.querySelector('dialog[open][data-image-viewer]'),s=getComputedStyle(d);return{background:s.backgroundColor,ink:getComputedStyle(d.querySelector('p')).color}})()");assert(contrast(color(gallery.ink),color(gallery.background))>=4.5,'Photograph viewer chrome follows the chosen mode');
   await evaluate("document.querySelector('[aria-label=\"Close photographs\"]').click()");
   await evaluate("[...document.querySelectorAll('dialog[open] button')].find(b=>b.textContent.trim()==='Request to Buy').click()");await dialogContrast('Sign in to PineMarket');await capture(`${width}-${theme}-market-signin`);
   await evaluate("document.querySelector('dialog[aria-label=\"Sign in to PineMarket\"] [aria-label=\"Close sign-in prompt\"]').click()");await evaluate("document.querySelector('[aria-label=\"Close inspection\"]').click()");
   await evaluate("document.querySelector('[aria-label=\"Add Study essentials to wishlist\"]').click()");await dialogContrast('Sign in to PineMarket');await evaluate("document.querySelector('[aria-label=\"Close sign-in prompt\"]').click()");
   await load('/#/pineresidence',theme);await until("document.querySelectorAll('[data-residence-id]').length===3",'Residence fixtures load');
   await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='View Details').click()");await dialogContrast('Hostel Accommodation Details');await capture(`${width}-${theme}-residence-details`);
   await evaluate("document.querySelector('dialog[open] [aria-label=\"Close dialog\"]').click()");await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Activate Key').click()");await dialogContrast('Sign in to PineResidence');await evaluate("document.querySelector('[aria-label=\"Close sign-in prompt\"]').click()");
   await load('/#/pinemarket/stores/browser-fixture-store',theme);await evaluate("document.querySelector('[aria-label=\"Message store\"]').click()");await dialogContrast('Sign in to message store');await evaluate("document.querySelector('[aria-label=\"Close sign-in prompt\"]').click()");
   await evaluate("document.querySelector('.pv-install-button').click()");await dialogContrast('Install PineVela');await capture(`${width}-${theme}-install-instructions`);
  });
  await test('Explore pages and Why Us preserve a manual slide through navigation and reload',async()=>{
   await viewport(1440);await load('/#/pinemarket','light',true);await evaluate("document.querySelector('[role=switch]').click()");await until("document.documentElement.dataset.theme==='dark'",'Explore slider changes mode');
   for(const [route,selector] of [['/#/pineresidence','[data-public-residence]'],['/#/pinemarket/stores/browser-fixture-store','[data-market-storefront]'],['/#/why-us','.why-us-page'],['/#/','.landing-peak-hero']]){await command('Page.navigate',{url:origin+route});await until(`!!document.querySelector(${JSON.stringify(selector)})&&document.documentElement.dataset.theme==='dark'`,'Navigation preserves selected mode');await command('Page.reload');await until(`!!document.querySelector(${JSON.stringify(selector)})&&document.documentElement.dataset.theme==='dark'`,'Reload preserves selected mode');}
  });
  await test('Open public dialogs change color live with System',async()=>{
   await load('/#/pinemarket','system',false);await evaluate("document.querySelector('[aria-label=\"Inspect Study essentials\"]').click()");await dialogContrast('Inspect Study essentials');
   const before=await evaluate("getComputedStyle(document.querySelector('dialog[open]>section')).backgroundColor");await os(true);await until("document.documentElement.dataset.theme==='dark'",'Open dialog follows System');await dialogContrast('Inspect Study essentials');assert.notEqual(await evaluate("getComputedStyle(document.querySelector('dialog[open]>section')).backgroundColor"),before,'The already open panel repaints');
  });
  for(const width of [320,1440])for(const theme of ['light','dark'])await test(`${width}px ${theme} current Terms acceptance`,async()=>{
   const accepts=legalAcceptances.length;
   await viewport(width);await load('/#/user/dashboard',theme,theme==='light',{role:'user',terms:'pending',selector:'.terms-review-card'});
   await until("!!document.querySelector('.terms-review-card input[type=checkbox]')",'Published Terms choice');
   const state=await evaluate(`(()=>{const c=document.querySelector('.terms-review-card'),input=c.querySelector('input[type=checkbox]'),button=c.querySelector('button[type=submit]'),label=c.querySelector('label'),s=getComputedStyle(c);return{theme:document.documentElement.dataset.theme,checked:input.checked,disabled:button.disabled,overflow:document.documentElement.scrollWidth>innerWidth,ink:s.color,bg:s.backgroundColor,labelFor:label.htmlFor,inputId:input.id,terms:c.querySelector('.terms-acceptance-control a').getAttribute('href')}})()`);
   assert.equal(state.theme,theme);assert.equal(state.checked,false);assert.equal(state.disabled,true);assert.equal(state.overflow,false);assert.equal(state.labelFor,state.inputId);assert.equal(state.terms,'/legal/terms-2026-11-05.html');assert(contrast(color(state.ink),color(state.bg))>=4.5);
   const currentScene=await evaluate("new URLSearchParams(location.search).get('scene')");
   assert(apiRequestsByScene.filter(r=>r.scene===currentScene).every(r=>['/api/auth/me','/api/settings','/api/auth/maintenance-notice','/api/auth/appearance','/api/legal/status'].includes(r.path)),'Private page and notification providers wait for agreement');
   await evaluate("document.querySelector('.terms-review-card button[type=submit]').click()");await pause(120);assert.equal(legalAcceptances.length,accepts,'Unchecked choice cannot submit');
   await capture(`${width}-${theme}-terms-acceptance`);
   await evaluate("document.querySelector('.terms-review-card input').focus()");await command('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await command('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
   await until("!document.querySelector('.terms-review-card button[type=submit]').disabled",'Keyboard choice enables acceptance');
   await evaluate("document.querySelector('.terms-review-card button[type=submit]').click()");await until("!document.querySelector('.terms-review-card')",'Confirmed saved acceptance releases the page');
   assert.equal(legalAcceptances.length,accepts+1);
  });
  await test('Terms save failure keeps the account behind the agreement screen',async()=>{
   await viewport(390);await load('/#/user/dashboard','light',false,{role:'user',terms:'pending-failure',selector:'.terms-review-card'});
   await until("!!document.querySelector('.terms-review-card input')",'Agreement choice');
   await evaluate("document.querySelector('.terms-review-card input').click();document.querySelector('.terms-review-card button[type=submit]').click()");
   await until("document.querySelector('.terms-review-error')?.textContent.includes('Local fixture save unavailable')",'Save error is visible');
   assert(await evaluate("!!document.querySelector('.terms-review-card')&&!document.querySelector('.user-dashboard')"));
  });
  for(const width of [320,390,430,1440])for(const theme of ['light','dark'])await test(`${width}px ${theme} signup agreement controls`,async()=>{
   await viewport(width);await load('/#/login?mode=register',theme,false,{selector:'.login-signup-form'});
   const state=await evaluate(`(()=>{const c=document.querySelector('.login-signup-form'),terms=c.querySelector('.terms-acceptance-control'),label=terms.querySelector('label'),helper=terms.querySelector('p');return{unchecked:!c.querySelector('input[type=checkbox]').checked,required:c.querySelector('input[type=checkbox]').required,disabled:c.querySelector('button[type=submit]').disabled,googleDisabled:document.querySelector('.login-google-button').disabled,overflow:document.documentElement.scrollWidth>innerWidth,labelFont:parseFloat(getComputedStyle(label).fontSize),labelLine:parseFloat(getComputedStyle(label).lineHeight),helperFont:parseFloat(getComputedStyle(helper).fontSize),linkFont:parseFloat(getComputedStyle(label.querySelector('a')).fontSize),termsHeight:terms.getBoundingClientRect().height}})()`);
   assert.equal(state.unchecked,true);assert.equal(state.required,true);assert.equal(state.disabled,true);assert.equal(state.googleDisabled,true);assert.equal(state.overflow,false);
   assert.equal(state.linkFont,state.labelFont,'The linked Terms stay the same readable size');
   if(width<640){assert(state.labelFont>=12&&state.labelFont<=12.5);assert(state.helperFont>=11&&state.helperFont<=11.5);assert(state.labelLine>=state.labelFont*1.4);}
   else assert.equal(state.labelFont,14,'Desktop label sizing is preserved');
   await evaluate("document.querySelector('.login-signup-form input[type=checkbox]').click()");assert.equal(await evaluate("document.querySelector('.login-google-button').disabled"),false);
   await capture(`${width}-${theme}-signup-terms`);
  });
  for(const theme of ['light','dark'])await test(`${theme} Help remains reachable before Terms acceptance; product access stays gated`,async()=>{
   await viewport(390);const accepts=legalAcceptances.length;await load('/#/user/dashboard',theme,false,{role:'user',terms:'pending',selector:'.terms-review-card'});await checkBrand(theme);
   await evaluate("document.querySelector('.terms-review-footer a').click()");await until("!!document.querySelector('.support-surface textarea')&&!document.querySelector('.terms-review-card')",'In-app Help opens before accepting Terms');
   assert.equal(await evaluate("location.hash"),'#/help?category=account');assert(await evaluate("[...document.querySelectorAll('a')].some(a=>a.textContent==='Email support'&&a.protocol==='mailto:')"),'Email is a separately labelled fallback');
   await evaluate("location.hash='#/user/dashboard'");await until("!!document.querySelector('.terms-review-card')&&!document.querySelector('.user-dashboard')",'Returning to the product requires Terms again');assert.equal(legalAcceptances.length,accepts);
  });
  if(sellerWorkflows){
   const enter=async(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing field '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
   const clickText=async(selector,text)=>{assert(await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length&&e.textContent.includes(${JSON.stringify(text)}));if(!e)return false;e.click();return true})()`),'Visible control '+text);};
   const sellerServices=async width=>{if(width<640){await evaluate("document.querySelector('nav[data-curved-navigation] [data-navigation-id=more]').click()");await until("!!document.querySelector('[data-portal-navigation=menu]')",'Seller More destinations');await evaluate("document.querySelector('[data-portal-navigation=menu] [data-navigation-id=services]').click()");}else await clickText('button[data-page-tabs]','Services (');};
   const sellerPublish=async kind=>{await evaluate("document.querySelector('nav[data-curved-navigation] [data-navigation-id=quick-action]').click()");await until("!!document.querySelector('dialog[aria-label=\"Publish to your store\"]')",'Seller publish chooser');await evaluate(`document.querySelector('dialog[aria-label="Publish to your store"] button[aria-label=${JSON.stringify(kind==='service'?'Offer a service':'Publish an item')}]').click()`);};
   const actionPaint=async(selector,theme)=>{await pause(400);const s=await evaluate(`(()=>{const s=getComputedStyle(document.querySelector(${JSON.stringify(selector)}));return{paint:s.backgroundImage,ink:s.color}})()`);assert(s.paint.includes(theme==='light'?'rgb(0, 53, 102)':'rgb(255, 195, 0)'),selector+' selected fill');assert.equal(s.ink,theme==='light'?'rgb(255, 255, 255)':'rgb(0, 29, 61)');};
   for(const theme of ['light','dark'])await test(`${theme} signup retry during cooldown explains the original credentials`,async()=>{
    await viewport(390);await load('/#/login?mode=register',theme,false,{signupResume:'cooldown',selector:'.login-signup-form'});
    await enter('input[aria-label="Your Full Name"]','First fixture name');await enter('input[aria-label="Email Address"]','pending@example.test');await enter('input[aria-label="Choose Password"]','FirstFixture1!');await enter('input[aria-label="Confirm Password"]','FirstFixture1!');await evaluate("document.querySelector('.terms-acceptance-choice input').click()");
    await evaluate("document.querySelector('.login-signup-form').requestSubmit()");await until("!!document.querySelector('[data-active-tab=verify]')",'First signup awaits verification');assert(!await evaluate("!!document.querySelector('[data-signup-resume]')"));
    await evaluate("document.querySelector('.login-verification-back').click()");await until("!!document.querySelector('.login-signup-form')",'Return to registration');await enter('input[aria-label="Choose Password"]','SecondFixture1!');await enter('input[aria-label="Confirm Password"]','SecondFixture1!');
    await evaluate("document.querySelector('.login-signup-form').requestSubmit()");await until("!!document.querySelector('[data-signup-resume]')",'Cooldown retry explains resumed signup');
    await evaluate("document.querySelector('.login-verification-back').click()");await until("!!document.querySelector('.login-signup-form')",'Registration returns');assert.equal(await evaluate("document.querySelector('input[aria-label=\"Choose Password\"]').value"),'','Ignored replacement password is cleared');
   });
   for(const width of [390,1440])for(const theme of ['light','dark'])await test(`${width}px ${theme} unfinished signup resumes with an explicit original-credentials notice`,async()=>{
    await viewport(width);await load('/#/login?mode=register',theme,false,{signupResume:true,selector:'.login-signup-form'});
    await enter('input[aria-label="Your Full Name"]','Replacement fixture name');await enter('input[aria-label="Email Address"]','pending@example.test');await enter('input[aria-label="Choose Password"]','ReplacementFixture1!');await enter('input[aria-label="Confirm Password"]','ReplacementFixture1!');
    await evaluate("document.querySelector('.terms-acceptance-choice input').click()");await until("!document.querySelector('.login-signup-form button[type=submit]').disabled",'Agreement enables synthetic signup');
    await evaluate("document.querySelector('.login-signup-form').requestSubmit()");await until("!!document.querySelector('[data-signup-resume]')",'Explicit resume notice');
    assert(await evaluate("document.querySelector('[data-signup-resume]').textContent.includes('original name and password are kept')"),'The ignored replacement credentials are explained before confirmation');
    const notice=await evaluate("(()=>{const s=getComputedStyle(document.querySelector('[data-signup-resume]'));return{ink:s.color,surface:s.backgroundColor}})()");assert(contrast(color(notice.ink),color(notice.surface))>=4.5,'The resume notice is readable in both themes');
    await enter('input[aria-label="Email verification code"]','123456');await evaluate("document.querySelector('[data-active-tab=verify] form').requestSubmit()");await until("document.body.innerText.includes('This fixture code is invalid or expired.')",'Invalid code rejected');
    assert(await evaluate("document.querySelector('[data-signup-code-error]')?.previousElementSibling===document.querySelector('input[aria-label=\"Email verification code\"]')"),'The OTP error is under its code field');
    const attempt=signupResumeMutations.filter(m=>m.route==='/api/auth/verify-unified').at(-1);assert(attempt&&!Object.hasOwn(attempt.body,'password')&&!Object.hasOwn(attempt.body,'name'),'Confirmation does not pretend to replace original credentials');
    assert(await evaluate("!!document.querySelector('[data-signup-resume]')&&!document.querySelector('.user-dashboard')"),'An invalid OTP grants no account session');await capture(`${width}-${theme}-signup-resume`);
   });
   for(const width of [390,1440])for(const theme of ['light','dark'])await test(`${width}px ${theme} seller workbench publishing and retained photographs`,async()=>{
    await viewport(width);await load('/#/digital-market',theme,false,{role:'merchant',selector:'[data-product-screen=market]'});
    await clickText('button[data-page-tabs]',width<640?'Stock':'Inventory');await until("!!document.querySelector('[data-seller-panel=inventory]:not([hidden]) img')",'Inventory appears');
    if(width>=640)await actionPaint('button[data-page-tabs][aria-current=page]','dark');
    else assert.equal(await evaluate("getComputedStyle(document.querySelector('nav[data-curved-navigation] .pv-nav-indicator')).backgroundColor"),theme==='light'?'rgb(0, 53, 102)':'rgb(255, 214, 10)','Mobile navigation uses its approved theme accent');
    await evaluate("void(window.__sellerImage=document.querySelector('[data-seller-panel=inventory] img'))");
    await sellerServices(width);await until("!!document.querySelector('[data-seller-panel=services]:not([hidden])')",'Services appear');
    await clickText('button[data-page-tabs]',width<640?'Stock':'Inventory');assert(await evaluate("window.__sellerImage===document.querySelector('[data-seller-panel=inventory] img')&&window.__sellerImage.isConnected"),'Switching tabs keeps the same decoded image node');
    if(width<640)await sellerPublish('item');else await clickText('button','Publish Item');
    await until("!!document.querySelector('dialog[aria-label=\"Publish Item to Global Market\"]')",'Item form');
    const item='dialog[aria-label="Publish Item to Global Market"]';
    await enter(item+' input[aria-label="Product / Item Title"]','Saved draft item');
    await evaluate(`document.querySelector(${JSON.stringify(item+' input[type=file]')}).dispatchEvent(new Event('cancel',{bubbles:true}))`);
    assert(await evaluate(`!!document.querySelector(${JSON.stringify(item)})&&document.querySelector(${JSON.stringify(item+' input[aria-label="Product / Item Title"]')}).value==='Saved draft item'`),'Cancelling item picker preserves the form and draft');
    await evaluate(`document.querySelector(${JSON.stringify(item+' form')}).requestSubmit()`);await until(`!!document.querySelector(${JSON.stringify(item+' input[aria-label="Price in GHS (GH₵)"][aria-invalid=true]')})`,'Price error targets its field');
    assert(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(item+' input[aria-invalid=true]')}),s=document.getElementById(e.getAttribute('aria-describedby'));return s&&s.previousElementSibling===e&&getComputedStyle(s).position!=='sticky'})()`),'Error stays below the price input');
    await capture(`${width}-${theme}-seller-item-inline-error`);await actionPaint(item+' button[type=submit]',theme);
    await evaluate(`document.querySelector(${JSON.stringify(item+' [aria-label="Close dialog"]')}).click()`);
    await sellerServices(width);
    if(width<640)await sellerPublish('service');else await clickText('button','Offer New Service');
    await until("!!document.querySelector('dialog[aria-label=\"Publish service\"]')",'Service form');const service='dialog[aria-label="Publish service"]';
    await enter(service+' input[aria-label="Service Title"]','Saved draft service');
    await evaluate(`document.querySelector(${JSON.stringify(service+' input[type=file]')}).dispatchEvent(new Event('cancel',{bubbles:true}))`);
    assert(await evaluate(`!!document.querySelector(${JSON.stringify(service)})&&document.querySelector(${JSON.stringify(service+' input[aria-label="Service Title"]')}).value==='Saved draft service'`),'Cancelling service picker preserves the form and draft');
    await evaluate(`document.querySelector(${JSON.stringify(service+' form')}).requestSubmit()`);await until(`!!document.querySelector(${JSON.stringify(service+' input[aria-label="Starting Price / Fee (GHS)"][aria-invalid=true]')})`,'Service rate error targets its field');
    await actionPaint(service+' button[type=submit]',theme);await capture(`${width}-${theme}-seller-service-inline-error`);
    await evaluate(`document.querySelector(${JSON.stringify(service+' input[value=fixed]')}).click()`);await until(`getComputedStyle(document.querySelector(${JSON.stringify(service+' input[value=fixed]')}).closest('label')).borderTopColor===${JSON.stringify(theme==='light'?'rgb(0, 53, 102)':'rgb(255, 214, 10)')}`,'Location policy selection follows theme');
    await evaluate(`document.querySelector(${JSON.stringify(service+' [aria-label="Close dialog"]')}).click()`);
   });
   for(const theme of ['light','dark'])await test(`${theme} seller onboarding blocks invalid phone, suggests locations and retains map choices`,async()=>{
    await viewport(390);await load('/#/digital-market/onboard',theme,false,{role:'merchant',setup:'pending',selector:'[data-pv-onboarding] form'});
    await until(`document.querySelector('input[aria-label="Store / Market Name"]')?.value==='Visual fixture store'&&document.querySelector('input[aria-label="Merchant Username / Handle"]')?.value==='campus-fixture'&&!!document.querySelector('textarea[aria-label="Store Description / About"]')?.value`,'Verified store prefill');
    await clickText('button','Continue');await until("!!document.querySelector('[data-store-location]')",'Contact phase');
    const before=sellerMutations.length;await enter('input[aria-label="Primary contact phone number"]','123');await clickText('button','Continue to Secure Checkout');
    assert(await evaluate("!!document.querySelector('[data-store-location]')&&document.querySelector('input[aria-label=\"Primary contact phone number\"]').getAttribute('aria-invalid')==='true'"),'Invalid phone cannot leave the contact phase');assert.equal(sellerMutations.length,before);
    await until("document.activeElement===document.querySelector('input[aria-label=\"Primary contact phone number\"]')",'Invalid contact receives focus');
    await evaluate("document.querySelector('input[aria-label=\"Campus Location / Residence\"]').focus()");await enter('input[aria-label="Campus Location / Residence"]','Ayeduase');await until("document.querySelectorAll('[role=option]').length===2",'Address suggestions');
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    assert(await evaluate("document.querySelector('[role=combobox]').value.includes('Ayeduase Gate')"),'Keyboard selects a location suggestion');
    await clickText('button','Select on map');await until("!!document.querySelector('dialog[aria-label=\"Choose your store location\"] .leaflet-container')",'Lazy store map');
    await clickText('dialog[open] button','Confirm');await until("!document.querySelector('dialog[aria-label=\"Choose your store location\"]')",'Map confirmation');assert(await evaluate("document.querySelector('[role=combobox]').value.includes('6.670200')"),'Confirmed map selection retains coordinates in the saved address');
    await enter('input[aria-label="Primary contact phone number"]','0241234567');await clickText('button','Continue to Secure Checkout');await until("document.body.innerText.includes('Store Activation Fee')",'Valid contact reaches checkout');
    await evaluate("document.querySelector('form button[type=submit]').click()");await until("document.querySelector('form [role=alert]')?.textContent.includes('Paystack is not configured')",'Fixture checkout failure');
    assert(await evaluate("(()=>{const e=document.querySelector('form [role=alert]');return e.getBoundingClientRect().top>document.querySelector('form button[type=submit]').getBoundingClientRect().top&&getComputedStyle(e).position!=='sticky'})()"),'Non-field checkout failure stays beside the final action');
    assert(sellerMutations.some(m=>m.route==='/api/digital-market/store-setup'&&m.body.phone==='+233241234567'&&m.body.location.includes('Ayeduase')),'Setup sends normalized contact and selected location');await capture(`390-${theme}-seller-activation-checkout-error`);
   });
  }
  const productRoutes=[
   {name:'primary dashboard',route:'/#/user/dashboard',role:'user',selector:'.user-dashboard [data-dashboard-view]'},
   {name:'manager dashboard',route:'/#/manager/dashboard',role:'manager',selector:'[data-dashboard-shell] main'},
   {name:'staff dashboard',route:'/#/staff/dashboard',role:'staff',selector:'[data-staff-dashboard] main'},
   {name:'resident dashboard',route:'/#/resident/dashboard',role:'student',selector:'[data-dashboard-shell] main'},
   {name:'administrator dashboard',route:'/#/admin/dashboard',role:'admin',selector:'.admin-dashboard main'},
   {name:'seller dashboard',route:'/#/digital-market',role:'merchant',selector:'[data-product-screen=market] main'},
   {name:'field officer',route:'/#/field-officer',role:'field_officer',selector:'.verification-portal'},
   {name:'customer service',route:'/#/customer-service',role:'user',selector:'nav[aria-label="Customer-service sections"]'},
   {name:'manager onboarding',route:'/#/register-manager',role:'user',selector:'section[aria-label="Manager registration progress"],section[aria-labelledby] h1'},
   {name:'store onboarding',route:'/#/digital-market/onboard',role:'merchant',setup:'pending',selector:'section[aria-label="Store activation progress"]'},
  ];
  if(mobileUi&&!curvedNavUi)await require('./lib/mobile-ui-browser-checks.cjs')({viewport,load,evaluate,until,test,capture,command,os,pause,productRoutes,output});
  if(sidebarUi)await require('./lib/compact-sidebar-browser-checks.cjs')({viewport,load,evaluate,until,test,capture,command,pause,output,productRoutes});
  if(curvedNavUi)await require('./lib/mobile-navigation-browser-checks.cjs')({viewport,load,evaluate,until,test,capture,command,pause,output,productRoutes,fileChooserEvents});
  if(shortKeysUi)await require('./lib/short-keys-browser-checks.cjs')({viewport,load,evaluate,until,test,capture,pause,managerCodeRotations});
  if(subscriptionUi)await require('./lib/seller-subscription-browser-checks.cjs')({viewport,load,evaluate,until,test,capture,command,pause,output,setSubscriptionRates,subscriptionCheckouts,settingsStreams});
  if(catalogCacheUi)await require('./lib/catalog-image-cache-browser-checks.cjs')({viewport,load,evaluate,until,test,capture,command,pause,output,photoRequests,photoPath,resetCatalogPhotos,notifyCatalog,settingsStreams,updateCatalog:work=>work(catalog,hostels)});
  if(residentPinUi)await require('./lib/resident-pin-browser-checks.cjs')({viewport,load,evaluate,until,test,capture,pause,output,residentPinRequests});
  if(nearbyUi)await require('./lib/nearby-shops-browser-checks.cjs')({viewport,load,evaluate,until,test,capture,pause,output,mapStoreRequests});
  if(androidLayout)await androidLayout.run({viewport,load,evaluate,until,test,capture,command,pause,output,productRoutes});
  if(profileToastUi)await require('./lib/profile-toast-browser-checks.cjs')({viewport,load,evaluate,until,test,capture,pause,output});
  if(googleReturnUi)await require('./lib/google-return-browser-checks.cjs')({viewport,load,evaluate,until,test,capture,pause,output,apiRequests});
  if(managerFixUi)await require('./lib/manager-terms-browser-checks.cjs')({viewport,load,evaluate,until,test,capture,pause,output,legalAcceptances,apiRequests});
  for(const width of [390,1440])for(const theme of ['light','dark'])for(const page of productRoutes)await test(`${width}px ${theme} product fixture: ${page.name}`,async()=>{
   await viewport(width);await load(page.route,theme,theme==='light',page);
   const data=await evaluate(`(()=>{const s=getComputedStyle(document.documentElement),main=document.querySelector('main,.verification-portal')||document.querySelector('#root .page-canvas');return{theme:document.documentElement.dataset.theme,canvas:s.backgroundColor,ink:getComputedStyle(main).color,overflow:document.documentElement.scrollWidth>innerWidth,text:document.body.innerText,publicTheme:document.documentElement.dataset.publicTheme}})()`);
   assert.equal(data.theme,theme);assert.equal(data.publicTheme,'none');assert.equal(data.overflow,false,'Product page fits the viewport');assert(contrast(color(data.ink),color(data.canvas))>=4.5,'Product content inherits legible theme ink');
   if(await evaluate("!!document.querySelector('.pinevela-wordmark')"))await checkBrand(theme);
   const actionCount=await checkOnboardingActions(theme);if(page.name.endsWith('onboarding'))assert(actionCount>0,'The real onboarding form renders at least one primary action');
   assert(!/This page could not load|Access Denied|Your seller account could not load|Manager registration could not load/.test(data.text),'The actual page renders instead of an error boundary');
   if(width===390)await capture(`${width}-${theme}-${page.name.replaceAll(' ','-')}-fixture`);
  });
  for(const theme of ['light','dark'])await test(`Static 3D hero and glass accessibility fallback: ${theme}`,async()=>{
   await viewport(1440);await load('/#/',theme);await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
   await until("document.querySelector('[data-artwork-layers=landing]')?.getAttribute('data-motion-ready')==='true'",'Transparent animated artwork loads');
   assert(await evaluate("(()=>{const source=document.querySelector('.landing-peak-image').getAttribute('src');return [...document.querySelectorAll('[data-artwork-layers=landing] image')].every(i=>i.getAttribute('href')===source)})()"),'Animated layers must use the same transparent cutout without a yellow clean plate');
   await until("getComputedStyle(document.querySelector('.landing-peak-scene')).transform.startsWith('matrix3d(')",'Figure depth settles');
   const scene=await evaluate("(()=>{const e=document.querySelector('.landing-peak-scene'),s=getComputedStyle(e);return{transform:s.transform,filter:s.filter,layered:e.getAttribute('data-artwork-layered')}})()");
   assert.equal(scene.layered,'true','The existing artwork layers remain active inside the depth scene');
   assert(scene.transform.startsWith('matrix3d('),'The figure sits on a three-dimensional scene');
   assert(scene.filter.includes('drop-shadow('),'The transparent figure has a soft silhouette shadow');
   await evaluate("(()=>{const e=document.querySelector('.landing-peak-artwork'),r=e.getBoundingClientRect();e.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse',clientX:r.right-12,clientY:r.top+r.height/2}))})()");
   await pause(300);
   assert.equal(await evaluate("getComputedStyle(document.querySelector('.landing-peak-scene')).transform"),scene.transform,'Pointer movement does not tilt or translate the figure');
   assert.equal(await evaluate("document.querySelector('.landing-peak-artwork').hasAttribute('data-pointer-engaged')"),false);
   assert.equal(await evaluate("document.querySelector('.landing-peak-artwork').style.getPropertyValue('--landing-scene-rotate-y')"),'');
   assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-artwork-layers=landing] .artwork-layer')).animationName"),'none','Landing objects have static depth');
   const card=await evaluate("(()=>{const s=getComputedStyle(document.querySelector('.landing-peak-brand-card'));return{transform:s.transform,style:s.transformStyle,shadow:s.boxShadow}})()");
   if(await evaluate("matchMedia('(hover: hover) and (pointer: fine)').matches"))assert(card.transform.startsWith('matrix3d('));
   assert.equal(card.style,'preserve-3d');assert(card.shadow.split('rgb').length>=6,'Layered edges give the card visible depth');
   await capture(`1440-${theme}-transparent-hero-3d`);
   await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'},{name:'prefers-contrast',value:'more'}]});
   assert.equal(await evaluate("getComputedStyle(document.getElementById('benefits')).backdropFilter"),'none');assert.equal(await evaluate("getComputedStyle(document.querySelector('.landing-peak-brand-card')).transform"),'none');
   assert.equal(await evaluate("getComputedStyle(document.querySelector('.landing-peak-scene')).transform"),'none','Reduced motion keeps the figure still');
   await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme},{name:'prefers-reduced-motion',value:'reduce'},{name:'prefers-contrast',value:'no-preference'}]});
  });
  await test('Conventional favicon endpoint serves an image rather than the SPA document',async()=>{
   const data=await evaluate("(async()=>{const r=await fetch('/favicon.ico'),b=new Uint8Array(await r.arrayBuffer());return{status:r.status,type:r.headers.get('content-type'),prefix:[...b.slice(0,6)]}})()");assert.equal(data.status,200);assert(/image\//.test(data.type));assert.deepEqual(data.prefix,[0,0,1,0,1,0]);
  });
  await test('Browser appearance is the default; live OS changes keep System until a manual slide',async()=>{
   await viewport(1440);await load('/#/',null,false);assert.equal(await evaluate('document.documentElement.dataset.theme'),'light');
   assert.equal(await evaluate("localStorage.getItem('pinevela:appearance')"),null);await os(true);await until("document.documentElement.dataset.theme==='dark'",'OS dark');
   await evaluate("document.querySelector('[role=switch]').click()");await until("document.documentElement.dataset.theme==='light'",'Manual light');
   assert.equal(await evaluate("localStorage.getItem('pinevela:appearance')"),'light');await os(false);await os(true);assert.equal(await evaluate('document.documentElement.dataset.theme'),'light');
   await command('Page.reload');await until("document.documentElement.dataset.theme==='light'&&!!document.querySelector('.landing-peak-hero')",'Saved choice after reload');
   await command('Page.navigate',{url:origin+'/privacy.html'});await until("!!document.querySelector('.document')&&document.documentElement.dataset.theme==='light'",'Policy inherits manual light');
   await command('Page.navigate',{url:origin+'/#/faq?from=/'});await until("!!document.querySelector('input[type=search]')&&document.documentElement.dataset.theme==='light'",'FAQ inherits manual light');
   await evaluate("document.querySelector('[role=switch]').focus()");await command('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await command('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
   await until("document.documentElement.dataset.theme==='dark'",'Keyboard slider');
   await command('Page.navigate',{url:origin+'/terms.html'});await until("!!document.querySelector('.document')&&document.documentElement.dataset.theme==='dark'",'Terms inherits manual dark');
  });
  await test('FAQ search, native keyboard accordion and topic links remain usable',async()=>{
   await load('/#/faq?from=/','light');const initial=await evaluate('document.querySelectorAll("details").length');
   await evaluate(`(()=>{const i=document.querySelector('input[type=search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'room');i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
   await until(`document.querySelectorAll('details').length<${initial}`,'FAQ filters');assert(await evaluate('document.querySelectorAll("details").length>0'));
   assert(await evaluate("[...document.querySelectorAll('nav[aria-label=\"FAQ topics\"] a')].every(a=>document.getElementById(a.getAttribute('href').slice(1)))"));
   await evaluate("document.querySelector('summary').focus()");await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});assert(await evaluate('document.querySelector("details").open'));
  });
  await test('Policies follow live System and make no application API requests',async()=>{
   for(const route of ['/privacy.html','/terms.html']){const count=apiRequests.length;await load(route,'system',false);await os(true);await until("document.documentElement.dataset.theme==='dark'",'Live dark policy');await os(false);await until("document.documentElement.dataset.theme==='light'",'Live light policy');assert.equal(apiRequests.length,count);assert(await evaluate("[...document.querySelectorAll('.contents a')].every(a=>document.getElementById(a.getAttribute('href').slice(1)))"));}
  });
  await test('Policies remain readable with JavaScript disabled',async()=>{
   await command('Emulation.setScriptExecutionDisabled',{value:true});
   try{for(const dark of [false,true]){await os(dark);await command('Page.navigate',{url:origin+'/privacy.html?nojs='+dark});await pause(350);const data=await evaluate("({scheme:getComputedStyle(document.documentElement).colorScheme,bg:getComputedStyle(document.body).backgroundColor,rootBg:getComputedStyle(document.documentElement).backgroundColor,text:getComputedStyle(document.querySelector('.document p')).color,overflow:document.documentElement.scrollWidth>innerWidth})");assert.equal(data.scheme,dark?'dark':'light');assert.equal(data.overflow,false);assert(contrast(color(data.text),color(data.rootBg))>=4.5);}}
   finally{await command('Emulation.setScriptExecutionDisabled',{value:false});}
  });
  assert.equal(mutations.length,0);assert.equal(exceptions.length,0,exceptions.join('\n'));
  await test('A failed offline navigation uses Chromium default network error and recovers online without account caches',async()=>{
   await viewport(390);await load('/#/login?mode=login','light',false,{selector:'.login-credentials-form'});
   await until('Boolean(navigator.serviceWorker.controller)','Production worker controls the page');
   const manifest=await command('Page.getAppManifest');assert.equal(manifest.errors.length,0);assert.equal(JSON.parse(manifest.data).start_url,'/#/login');
   assert.deepEqual((await command('Page.getInstallabilityErrors')).installabilityErrors,[],'Chromium still accepts PineVela as installable');
   assert.deepEqual(await evaluate('caches.keys()'),[]);
   const targets=await send('Target.getTargets');const worker=targets.targetInfos.find(t=>t.type==='service_worker'&&t.url===origin+'/sw.js');assert(worker,'Actual production worker is running');
   const {sessionId:workerSession}=await send('Target.attachToTarget',{targetId:worker.targetId,flatten:true});
   await send('Network.enable',{},workerSession);await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0},workerSession);
   await command('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
   const navigation=await command('Page.navigate',{url:origin+'/?offline-check=1#/login'});
   await until("document.documentURI==='chrome-error://chromewebdata/'",'Browser default offline/error document');
   assert.equal(await evaluate("document.querySelector('.error-code')?.textContent"),'ERR_INTERNET_DISCONNECTED','The browser displays its actual offline page');
   assert(await evaluate("!document.querySelector('#root')&&!document.body.innerText.includes('PineVela needs an internet connection')"));
   await fs.writeFile(output+'/browser-offline.json',JSON.stringify({documentURI:await evaluate('document.documentURI'),navigationError:navigation.errorText,browserError:await evaluate("document.querySelector('.error-code')?.textContent"),customOfflineHTML:false,createdAccountCaches:0},null,2)+'\n');
   await capture('390-browser-default-offline');
   await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1},workerSession);await command('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
   await command('Page.navigate',{url:origin+'/#/login?mode=login'});await until("!!document.querySelector('.login-credentials-form')",'Online navigation restores login');assert.deepEqual(await evaluate('caches.keys()'),[]);
  });
  assert.equal(mutations.length,0);assert.equal(exceptions.length,0,exceptions.join('\n'));
  const report={passed:true,scenes:checks.length,checks,screenshots,navigationClearance,buildDirectory:path.relative(process.cwd(),root),syntheticGuestCatalog:true,syntheticRoleVisualFixtures:productRoutes.map(p=>p.name),hostedOrAccountWrites:0,realAuthenticationTested:false,runtimeExceptions:exceptions.length,syntheticSellerWrites:sellerMutations.length,syntheticSignupResumeWrites:signupResumeMutations.length,syntheticAppearanceWrites:appearanceSaves.length,syntheticSubscriptionCheckouts:subscriptionCheckouts.length,syntheticProfileSaves:profileAvatars.size,exceptionDetails:exceptions};await fs.writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,scenes:checks.length,report:output+'/report.json'}));
 }catch(e){await debugCapture('failure').catch(()=>{});await fs.writeFile(output+'/failure.json',JSON.stringify({scenario,completed:checks.length,error:e.message,exceptions,apiRequests,debug:await debug().catch(()=>({}))},null,2)+'\n');console.error(JSON.stringify({passed:false,scenario,completed:checks.length,error:e.message}));process.exitCode=1;}
 finally{chrome.kill();for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Browser closed'))}pending.clear();for(const stream of settingsStreams)stream.end();server.close();await fs.rm(profile,{recursive:true,force:true}).catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1});
