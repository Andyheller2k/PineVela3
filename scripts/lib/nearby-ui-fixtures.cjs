const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555'];
const pinned=(lat,lng)=>({point:{lat,lng},precision:'exact',label:'Owner-selected fixture pin'}),missing={point:null,precision:'unavailable',label:'Bomso'};
const stores=[
 {id:ids[0],storeName:'Campus Supply',location:'Kumasi (6.670100, -1.560200)',category:'Electronics',campus:'KNUST',logoUrl:'',mapLocation:pinned(6.6701,-1.5602)},
 {id:ids[1],storeName:'Bomso Creative',location:'Bomso',category:'Services',campus:'KNUST',logoUrl:'',mapLocation:missing},
 {id:ids[2],storeName:'Unpinned Studio',location:'Unresolved public area',category:'Services',campus:'KNUST',logoUrl:'',mapLocation:missing},
 {id:ids[3],storeName:'Quiet Corner',location:'Kumasi (6.675000, -1.565000)',category:'Textbooks',campus:'KNUST',logoUrl:'',mapLocation:pinned(6.675,-1.565)},
 {id:ids[4],storeName:'Accra Books',location:'Accra (5.550000, -0.200000)',category:'Textbooks',campus:'Accra',logoUrl:'',mapLocation:pinned(5.55,-.2)}
];
const products=[{id:'fixture-goods',storeId:ids[0],storeName:'Campus Supply',title:'Campus laptop',description:'Local visual fixture',price:100,category:'Electronics',imageUrl:'/icons/pinevela-192.png',isService:false,stockQuantity:2,isAvailable:true},
 {id:'fixture-flexible',storeId:ids[1],storeName:'Bomso Creative',title:'Graphic design',description:'Local flexible-service fixture',price:20,category:'Services',isService:true,stockQuantity:null,isAvailable:true,serviceLocationMode:'flexible'},
 {id:'fixture-fixed',storeId:ids[0],storeName:'Campus Supply',title:'Laptop repair',description:'Local fixed-service fixture',price:25,category:'Services',isService:true,stockQuantity:null,isAvailable:true,serviceLocationMode:'fixed',lat:6.6701,lng:-1.5602}];
const blocks=['Pine Male','Pine Female','Pine Mix'].map((name,i)=>({name,blockName:name,prefix:['PM','PF','PX'][i],genderCategory:['Male','Female','Mixed'][i],floors:10,totalRooms:i===2?20:90,bedsPerRoom:2}));
const keys=Array.from({length:200},(_,i)=>({id:'visual-room-'+i,roomKey:'TEST'+String(i).padStart(4,'0'),blockName:blocks[i<90?0:i<180?1:2].name,roomNumber:String(i+1),isAssigned:false}));
module.exports={stores,products,blocks,keys,unpinned:ids[2]};
