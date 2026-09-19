/* Public itinerary only. Never place booking references or credentials here. */
window.TREK_DATA = {
  updated: '2026-09-19',
  source: 'https://app.notion.com/p/3dc053444bde8099b522d98807bb2158?pvs=204',
  savedMap: 'https://maps.app.goo.gl/JQUJwBDUwqy2TfQP9',
  savedMapUpdated: 'https://maps.app.goo.gl/y1Kww3mHPbMZbS1c8',
  savedPlaces: window.TREK_SAVED_PLACES || [],
  placeDecisions: {},
  bringLists: [
    { id:'bag-1', name:'背包1', owner:'Rylee', ownerAccount:'rylee@nobby.com', items:[
      { id:'bag1-carry-passport', group:'随身', label:'护照', done:false },
      { id:'bag1-carry-cards', group:'随身', label:'银行卡（银联 + Visa + Master）', done:false },
      { id:'bag1-carry-usd', group:'随身', label:'美金', done:false },
      { id:'bag1-carry-power-bank', group:'随身', label:'充电宝', done:false },
      { id:'bag1-carry-noise-cancelling', group:'随身', label:'降噪耳机', done:false },
      { id:'bag1-carry-tissues', group:'随身', label:'纸巾 + 消毒纸巾 ×1', done:false },
      { id:'bag1-carry-sim', group:'随身', label:'SIM卡 + 卡针', done:true },
      { id:'bag1-carry-mask', group:'随身', label:'口罩', done:false },
      { id:'bag1-carry-folding-bag', group:'随身', label:'折叠书包', done:false },
      { id:'bag1-carry-snacks', group:'随身', label:'零食', done:false },
      { id:'bag1-carry-bottle', group:'随身', label:'水杯', done:false },
      { id:'bag1-carry-earbuds', group:'随身', label:'入耳式耳机', done:false },
      { id:'bag1-pack-underwear', group:'背包里', label:'内裤 + 内衣', done:false },
      { id:'bag1-pack-clothes', group:'背包里', label:'衣服', done:false },
      { id:'bag1-pack-shell', group:'背包里', label:'外套 - 冲锋衣', done:false },
      { id:'bag1-pack-pants', group:'背包里', label:'裤子 ×2（穿一带一）', done:false },
      { id:'bag1-pack-shoes', group:'背包里', label:'鞋子 ×2（穿一带一）', done:false },
      { id:'bag1-pack-flip-flops', group:'背包里', label:'人字拖', done:false },
      { id:'bag1-pack-umbrella', group:'背包里', label:'雨伞', done:false },
      { id:'bag1-pack-charger', group:'背包里', label:'手机充电器', done:false },
      { id:'bag1-pack-adapter', group:'背包里', label:'转换插头', done:false },
      { id:'bag1-pack-makeup-wipes', group:'背包里', label:'卸妆巾', done:false },
      { id:'bag1-pack-cleanser', group:'背包里', label:'洗面奶', done:false },
      { id:'bag1-pack-skincare', group:'背包里', label:'护肤品', done:false },
      { id:'bag1-pack-bb', group:'背包里', label:'BB', done:false },
      { id:'bag1-pack-sunscreen', group:'背包里', label:'防晒霜', done:false },
      { id:'bag1-pack-powder', group:'背包里', label:'散粉', done:false },
      { id:'bag1-pack-makeup', group:'背包里', label:'眉笔、眼线笔、眼影、口红', done:false },
      { id:'bag1-pack-aloe', group:'背包里', label:'小芦荟胶', done:false },
      { id:'bag1-pack-face-towels', group:'背包里', label:'洗脸巾', done:false },
      { id:'bag1-pack-toothbrush', group:'背包里', label:'牙刷', done:false },
      { id:'bag1-pack-tissues', group:'背包里', label:'纸巾 ×8', done:false },
      { id:'bag1-pack-wet-wipes', group:'背包里', label:'湿纸巾 ×2', done:false },
      { id:'bag1-pack-disinfecting-wipes', group:'背包里', label:'消毒湿纸巾 ×6', done:false },
      { id:'bag1-pack-sunglasses', group:'背包里', label:'墨镜', done:false },
      { id:'bag1-pack-sun-hat', group:'背包里', label:'遮阳帽子', done:false },
      { id:'bag1-pack-earplugs', group:'背包里', label:'耳塞', done:false },
      { id:'bag1-pack-sanitary-pads', group:'背包里', label:'卫生巾', done:false }
    ]},
    { id:'bag-2', name:'背包2', owner:'Nobby', ownerAccount:'nobby@rylee.com', items:[] }
  ],
  cities: [
    { id:'tashkent', name:'塔什干', en:'TASHKENT', country:'乌兹别克斯坦', coords:[41.2995,69.2401], dates:'09.25 — 09.27', nights:2, hotel:'Igmar villas & aparts', theme:'旅程的起点', highlights:['白色清真寺','伊斯兰文化中心','芭蕾之夜'], dayIds:[0,1], color:'#206b5c' },
    { id:'samarkand', name:'撒马尔罕', en:'SAMARKAND', country:'乌兹别克斯坦', coords:[39.6542,66.9597], dates:'09.27 — 09.28', nights:1, hotel:'Hotel Silver Rows', theme:'蓝色穹顶与丝路夜色', highlights:['夏伊辛达陵墓群','手工艺人中心','雷吉斯坦夜景'], dayIds:[2], color:'#217c9e' },
    { id:'bukhara', name:'布哈拉', en:'BUKHARA', country:'乌兹别克斯坦', coords:[39.7681,64.4556], dates:'09.28 — 09.30', nights:2, hotel:'BAKOVUL HERITAGE', theme:'在老城慢下来', highlights:['布哈拉老城','街巷与手工艺','古城夜景'], dayIds:[3,4], color:'#a74442' },
    { id:'khiva', name:'希瓦', en:'KHIVA', country:'乌兹别克斯坦', coords:[41.3783,60.3639], dates:'09.30 — 10.02', nights:2, hotel:'Hotel Old Town Khiva', theme:'城墙以内的时光', highlights:['伊钦卡拉古城','古城漫步','日落与夜景'], dayIds:[5,6], color:'#946c20' },
    { id:'nukus', name:'努库斯', en:'NUKUS', country:'乌兹别克斯坦', coords:[42.4600,59.6100], dates:'10.02 — 10.03', nights:1, hotel:'Jipek Joli Art', theme:'荒漠中的先锋艺术', highlights:['萨维茨基美术馆','市区休整','次日早班机'], dayIds:[7], color:'#626397' },
    { id:'aktau', name:'阿克套', en:'AKTAU', country:'哈萨克斯坦', coords:[43.6532,51.1975], dates:'10.03 — 10.05', nights:2, hotel:'Dostyk Hotel Aktau', theme:'在里海东岸收尾', highlights:['里海海滨','骑马体验（候选）','曼格斯套一日游（候选）'], dayIds:[8,9,10], color:'#28718a' }
  ],
  legs: [
    { id:'ca1759', date:'09.25', mode:'flight', code:'CA1759', from:'杭州萧山 T4', to:'重庆江北 T3', dep:'07:30', arr:'10:00', who:'杭州出发', confirmed:true },
    { id:'ca8543', date:'09.25', mode:'flight', code:'CA8543', from:'上海浦东 T2', to:'重庆江北 T3', dep:'09:00', arr:'11:50', who:'上海出发的伙伴', confirmed:true },
    { id:'ca779', date:'09.25', mode:'flight', code:'CA779', from:'重庆江北 T3', to:'塔什干国际 T2', dep:'17:15', arr:'23:55', who:'两人同行', confirmed:true, note:'按最新待办时间表记录 23:55 抵达。酒店深夜入住已提前沟通。' },
    { id:'rail716', date:'09.27', mode:'rail', code:'716ФА', from:'塔什干客运站', originalFrom:'ТОШКЕНТ-ЙУЛОВЧИ', to:'撒马尔罕', originalTo:'САМАРКАНД', dep:'08:58', arr:'12:11', duration:'3小时13分', confirmed:true, map:['tashkent','samarkand'] },
    { id:'rail770', date:'09.28', mode:'rail', code:'770ФА', from:'撒马尔罕', originalFrom:'САМАРКАНД', to:'布哈拉 1 站', originalTo:'БУХОРО 1', dep:'10:59', arr:'12:36', duration:'1小时37分', confirmed:true, map:['samarkand','bukhara'] },
    { id:'rail752', date:'09.30', mode:'rail', code:'752ЖА', from:'布哈拉 1 站', originalFrom:'БУХОРО 1', to:'希瓦', originalTo:'ХИВА', dep:'11:14', arr:'14:42', duration:'3小时28分', confirmed:true, map:['bukhara','khiva'] },
    { id:'road', date:'10.02', mode:'road', code:'公路转场', from:'希瓦', to:'努库斯', dep:'待定', arr:'待定', confirmed:false, map:['khiva','nukus'], note:'旧对话中曾选择 Yandex Go，Notion 最新表格仍写包车；叫车方式与时间待统一，尚未标记为已预订。' },
    { id:'c6211', date:'10.03', mode:'flight', code:'C6211', from:'努库斯', to:'阿克套', dep:'08:50', arr:'10:35', confirmed:true, map:['nukus','aktau'] },
    { id:'dv710', date:'10.05', mode:'flight', code:'DV710', from:'阿克套', to:'奇姆肯特 A', dep:'15:00', arr:'17:20', confirmed:true },
    { id:'dv461', date:'10.05', mode:'flight', code:'DV461', from:'奇姆肯特 A', to:'上海浦东 T2', dep:'19:10', arr:'04:55', nextDay:true, confirmed:true }
  ],
  days: [
    { date:'09.25', week:'周五', city:'杭州 / 上海 → 重庆 → 塔什干', cityId:'tashkent', legs:['ca1759','ca8543','ca779'], am:'分别从杭州、上海出发', pm:'重庆会合', night:'抵达塔什干，入住酒店', note:'重庆火锅视转机时间安排；深夜入住', hotel:'Igmar villas & aparts' },
    { date:'09.26', week:'周六', city:'塔什干', cityId:'tashkent', legs:[], local:'市内交通', am:'白色清真寺', pm:'伊斯兰文化中心', night:'芭蕾 19:00–21:00（计划）', note:'文化中心灯光秀与芭蕾时间可能冲突', hotel:'Igmar villas & aparts' },
    { date:'09.27', week:'周日', city:'塔什干 → 撒马尔罕', cityId:'samarkand', legs:['rail716'], am:'火车前往撒马尔罕', pm:'夏伊辛达、手工艺人中心', night:'雷吉斯坦夜景', note:'抵达后先放行李', hotel:'Hotel Silver Rows' },
    { date:'09.28', week:'周一', city:'撒马尔罕 → 布哈拉', cityId:'bukhara', legs:['rail770'], am:'退房，火车前往布哈拉', pm:'布哈拉老城漫步', night:'老城夜逛', note:'到达布哈拉 1 站', hotel:'BAKOVUL HERITAGE' },
    { date:'09.29', week:'周二', city:'布哈拉', cityId:'bukhara', legs:[], local:'市内交通', am:'布哈拉老城', pm:'街巷与手工艺，自由安排', night:'自由安排', note:'景点顺序待细化', hotel:'BAKOVUL HERITAGE' },
    { date:'09.30', week:'周三', city:'布哈拉 → 希瓦', cityId:'khiva', legs:['rail752'], am:'火车前往希瓦', pm:'14:42 抵达，入住', night:'伊钦卡拉古城初探', note:'已购三段火车票之一', hotel:'Hotel Old Town Khiva' },
    { date:'10.01', week:'周四', city:'希瓦', cityId:'khiva', legs:[], local:'步行', am:'伊钦卡拉古城', pm:'古城漫步', night:'自由安排', note:'保留完整古城游览日', hotel:'Hotel Old Town Khiva' },
    { date:'10.02', week:'周五', city:'希瓦 → 努库斯', cityId:'nukus', legs:['road'], am:'退房，公路前往努库斯', pm:'萨维茨基美术馆', night:'努库斯休息', note:'转场方式待统一；美术馆开放待复核', hotel:'Jipek Joli Art' },
    { date:'10.03', week:'周六', city:'努库斯 → 阿克套', cityId:'aktau', legs:['c6211'], am:'飞往阿克套', pm:'海滨放松；骑马为候选', night:'里海海滨，自由安排', note:'骑马档期、教练与海边运送费用未确认', hotel:'Dostyk Hotel Aktau' },
    { date:'10.04', week:'周日', city:'阿克套', cityId:'aktau', legs:[], local:'机动', am:'市区休闲 / 曼格斯套一日游', pm:'延续当日活动', night:'返回阿克套休息', note:'三景一日游为候选，具体路线及报名待确认', hotel:'Dostyk Hotel Aktau' },
    { date:'10.05', week:'周一', city:'阿克套 → 奇姆肯特 → 上海', cityId:'aktau', legs:['dv710','dv461'], am:'阿克套自由活动，退房', pm:'飞往奇姆肯特', night:'转机飞往上海', note:'转机间隔 1小时50分；次日到达', hotel:'机上' },
    { date:'10.06', week:'周二', city:'上海', cityId:null, legs:[], local:'DV461 04:55 抵达', am:'抵达上海，回家休息', pm:'—', night:'—', note:'行程结束', hotel:'—' }
  ],
  todoDays: [
    { id:'0925', date:'9/25', week:'周五', items:[
      { time:'07:30–10:00', title:'杭州 → 重庆 · CA1759', badge:'已购', maps:[['杭州萧山 T4','杭州萧山国际机场 T4'],['重庆江北 T3','重庆江北国际机场 T3']], note:'杭州出发方', done:false },
      { time:'09:00–11:50', title:'上海 → 重庆 · CA8543', badge:'已购', maps:[['上海浦东 T2','上海浦东国际机场 T2'],['重庆江北 T3','重庆江北国际机场 T3']], note:'上海出发方', done:false },
      { time:'12:00–15:00', title:'重庆会合、午餐、国际航班准备', maps:[['重庆江北机场','重庆江北国际机场']], note:'可在机场附近或航站楼解决午饭，不必进城太深', done:false },
      { time:'17:15–23:55', title:'重庆 → 塔什干 · CA779', badge:'已购', maps:[['重庆江北 T3','重庆江北国际机场 T3'],['塔什干国际 T2','Tashkent International Airport Terminal 2']], note:'最新确认到达时间 23:55', done:false },
      { time:'次日 00:30左右', title:'入住 Igmar Villas', maps:[['Igmar Villas','Igmar Villas Tashkent']], note:'已提前沟通深夜入住', done:false }
    ]},
    { id:'0926', date:'9/26', week:'周六', items:[
      { time:'09:30–10:30', title:'早餐 / 慢启动', maps:[['Igmar Villas','Igmar Villas Tashkent']], note:'前一晚抵达很晚，不建议早起', done:false },
      { time:'10:30–12:00', title:'Minor Mosque 白色清真寺', maps:[['Minor Mosque','Minor Mosque Tashkent']], note:'注意服装要求', done:false },
      { time:'12:30–16:00', title:'Islamic Civilization Center 伊斯兰文明中心', maps:[['伊斯兰文明中心','Center of Islamic Civilization in Uzbekistan']], note:'主要文化行程', done:false },
      { time:'16:00–17:30', title:'咖啡 / 市区自由活动', maps:[['塔什干市中心','Tashkent city center']], note:'给晚上演出留缓冲', done:false },
      { time:'17:30–18:30', title:'提前晚餐', maps:[['纳沃伊剧院周边','Alisher Navoi Theatre Tashkent']], note:'—', done:false },
      { time:'19:00–21:00', title:'芭蕾演出', maps:[['纳沃伊剧院','Alisher Navoi Theatre Tashkent']], note:'与灯光秀冲突时优先芭蕾', done:false }
    ]},
    { id:'0927', date:'9/27', week:'周日', items:[
      { time:'07:30', title:'酒店出发前往火车站', maps:[['Igmar Villas','Igmar Villas Tashkent'],['塔什干客运站','Tashkent Central Railway Station']], note:'建议提前约车', done:false },
      { time:'08:58–12:11', title:'塔什干 → 撒马尔罕 · 716ФА', badge:'已购', maps:[['塔什干客运站','Tashkent Central Railway Station'],['撒马尔罕站','Samarkand Railway Station']], note:'—', done:false },
      { time:'12:30–14:00', title:'入住 Silver Rows + 午餐', maps:[['Hotel Silver Rows','Hotel Silver Rows Samarkand']], note:'—', done:false },
      { time:'14:30–16:30', title:'Shah-i-Zinda 夏伊辛达', maps:[['Shah-i-Zinda','Shah-i-Zinda Samarkand']], note:'建议先安排', done:false },
      { time:'16:45–18:00', title:'手工艺中心 / 市区漫步', maps:[['手工艺中心','Konigil Meros Samarkand']], note:'可弹性调整', done:false },
      { time:'18:00–19:00', title:'晚餐', maps:[['雷吉斯坦周边','Registan Samarkand restaurants']], note:'—', done:false },
      { time:'19:00以后', title:'Registan 雷吉斯坦夜景', maps:[['Registan','Registan Square Samarkand']], note:'当天核心', done:false }
    ]},
    { id:'0928', date:'9/28', week:'周一', items:[
      { time:'08:00–09:00', title:'早餐 / 撒马尔罕最后散步', maps:[['Hotel Silver Rows','Hotel Silver Rows Samarkand']], note:'不再塞大型景点', done:false },
      { time:'09:45', title:'前往撒马尔罕站', maps:[['撒马尔罕站','Samarkand Railway Station']], note:'—', done:false },
      { time:'10:59–12:36', title:'撒马尔罕 → Buxoro 1 · 770ФА Afrosiyob', badge:'已购', maps:[['撒马尔罕站','Samarkand Railway Station'],['Buxoro 1','Bukhara 1 Railway Station']], note:'—', done:false },
      { time:'13:15–14:30', title:'入住 BAKOVUL Heritage + 午餐', maps:[['BAKOVUL Heritage','BAKOVUL HERITAGE Bukhara']], note:'—', done:false },
      { time:'15:00–18:00', title:'布哈拉老城初见', maps:[['布哈拉老城','Old City Bukhara']], note:'以散步为主', done:false },
      { time:'18:30以后', title:'Lyabi-Hauz / 老城夜逛', maps:[['Lyabi-Hauz','Lyabi Hauz Bukhara']], note:'不必赶景点', done:false }
    ]},
    { id:'0929', date:'9/29', week:'周二', items:[
      { time:'09:00–10:30', title:'Ark Fortress + Bolo Hauz', maps:[['Ark Fortress','Ark of Bukhara'],['Bolo Hauz','Bolo Hauz Mosque Bukhara']], note:'建议线路起点', done:false },
      { time:'10:45–12:30', title:'Poi Kalyan + Mir-i-Arab', maps:[['Poi Kalyan','Poi Kalyan Bukhara'],['Mir-i-Arab','Mir-i-Arab Madrasa Bukhara']], note:'当天建筑核心', done:false },
      { time:'12:30–14:00', title:'午餐 / 休息', maps:[['布哈拉老城','Old City Bukhara']], note:'—', done:false },
      { time:'14:00–17:30', title:'交易穹顶、老城街巷、手工艺店', maps:[['交易穹顶','Trading Domes Bukhara']], note:'慢逛', done:false },
      { time:'17:30–19:00', title:'Lyabi-Hauz / 茶馆', maps:[['Lyabi-Hauz','Lyabi Hauz Bukhara']], note:'—', done:false },
      { time:'19:00以后', title:'老城夜景', maps:[['布哈拉老城','Old City Bukhara']], note:'布哈拉第二个夜晚', done:false }
    ]},
    { id:'0930', date:'9/30', week:'周三', items:[
      { time:'08:00–09:30', title:'早餐 + 布哈拉最后散步', maps:[['BAKOVUL Heritage','BAKOVUL HERITAGE Bukhara']], note:'行李寄存酒店', done:false },
      { time:'10:00', title:'酒店出发前往 Buxoro 1', maps:[['Buxoro 1','Bukhara 1 Railway Station']], note:'—', done:false },
      { time:'11:14–14:42', title:'布哈拉 → 希瓦 · 752ЖА Jaloliddin Manguberdi', badge:'已购', maps:[['Buxoro 1','Bukhara 1 Railway Station'],['希瓦站','Khiva Railway Station']], note:'新高铁已投入塔什干—希瓦线运营', source:'https://railway.uz/uz/informatsionnaya_sluzhba/novosti/38788/', sourceLabel:'乌兹别克斯坦铁路', done:false },
      { time:'15:00–16:00', title:'入住 Old Town Khiva', maps:[['Hotel Old Town Khiva','Hotel Old Town Khiva']], note:'—', done:false },
      { time:'16:00–日落', title:'伊钦卡拉初见', maps:[['伊钦卡拉','Itchan Kala Khiva']], note:'不急着进入太多室内景点', done:false },
      { time:'日落后', title:'希瓦夜景 / 晚餐', maps:[['伊钦卡拉','Itchan Kala Khiva']], note:'第一个希瓦夜晚', done:false }
    ]},
    { id:'1001', date:'10/1', week:'周四', items:[
      { time:'07:00–08:30', title:'希瓦清晨漫步', maps:[['伊钦卡拉','Itchan Kala Khiva']], note:'强烈建议，游客少', done:false },
      { time:'09:00–12:30', title:'Juma Mosque、Tash Hauli、Kalta Minor', maps:[['Juma Mosque','Juma Mosque Khiva'],['Tash Hauli','Tash Khauli Palace Khiva'],['Kalta Minor','Kalta Minor Minaret Khiva']], note:'核心古城', done:false },
      { time:'12:30–14:00', title:'午餐 / 酒店休息', maps:[['Hotel Old Town Khiva','Hotel Old Town Khiva']], note:'—', done:false },
      { time:'14:00–17:00', title:'Islam Khoja + 博物馆', maps:[['Islam Khoja','Islam Khoja Minaret Khiva']], note:'按兴趣选择，不必全刷', done:false },
      { time:'17:00–日落', title:'城墙 / 高处看日落', maps:[['希瓦城墙','Khiva City Walls']], note:'当天重点', done:false },
      { time:'晚上', title:'最后一次希瓦夜游', maps:[['伊钦卡拉','Itchan Kala Khiva']], note:'—', done:false }
    ]},
    { id:'1002', date:'10/2', week:'周五', items:[
      { time:'08:00–09:30', title:'早餐 + 希瓦最后散步', maps:[['Hotel Old Town Khiva','Hotel Old Town Khiva']], note:'—', done:false },
      { time:'10:00左右', title:'Yandex Go 希瓦 → 努库斯', maps:[['希瓦','Khiva Uzbekistan'],['努库斯','Nukus Uzbekistan']], note:'现场叫车；跨城单需预留司机拒单可能', done:false },
      { time:'13:00左右', title:'抵达努库斯、入住 Jipek Joli Art / 午餐', maps:[['Jipek Joli Art','Jipek Joli Art Hotel Nukus']], note:'住美术馆—机场区域', done:false },
      { time:'14:00–17:00', title:'Savitsky Museum 萨维茨基美术馆', maps:[['萨维茨基美术馆','Savitsky Museum Nukus']], note:'周二–周日 09:00–18:00，周五正常开放', source:'https://savitskiy.acdf.uz/en/category/%D0%9A%D0%BE%D0%BD%D1%82%D0%B0%D0%BA%D1%82%D0%BD%D0%B0%D1%8F%20%D0%B8%D0%BD%D1%84%D0%BE%D1%80%D0%BC%D0%B0%D1%86%D0%B8%D1%8F', sourceLabel:'博物馆官网', done:false },
      { time:'17:30以后', title:'晚餐、整理行李、早点休息', maps:[['Jipek Joli Art','Jipek Joli Art Hotel Nukus']], note:'次日早班机', done:false }
    ]},
    { id:'1003', date:'10/3', week:'周六', items:[
      { time:'06:30', title:'起床 / 早餐', maps:[['Jipek Joli Art','Jipek Joli Art Hotel Nukus']], note:'—', done:false },
      { time:'07:00–07:15', title:'前往努库斯机场', maps:[['努库斯机场','Nukus International Airport']], note:'建议至少提前 1.5 小时', done:false },
      { time:'08:50–10:35', title:'努库斯 → 阿克套 · C6211', badge:'已购', maps:[['努库斯机场','Nukus International Airport'],['阿克套机场','Aktau International Airport']], note:'—', done:false },
      { time:'11:30–13:30', title:'入住 Dostyk Aktau + 午餐', maps:[['Dostyk Hotel Aktau','Dostyk Hotel Aktau']], note:'—', done:false },
      { time:'15:00–17:00', title:'海边骑马（可选）', maps:[['Loshadi_aktau','Loshadi aktau']], note:'新手教练有；海边运马加价待确认', done:false },
      { time:'17:00以后', title:'里海日落 / 海滨散步', maps:[['阿克套海滨','Aktau Caspian Sea promenade']], note:'若不骑马，则整个下午自由', done:false }
    ]},
    { id:'1004', date:'10/4', week:'周日', items:[
      { time:'约07:00', title:'Mangystau 三景一日团集合', maps:[['Dostyk Hotel Aktau','Dostyk Hotel Aktau']], note:'最终以旅行社通知为准', done:false },
      { time:'07:00–19:00左右', title:'曼格斯套三景往返一日游', maps:[['曼格斯套','Mangystau Region Kazakhstan']], note:'大概率确定参团；最终景点组合待锁', done:false },
      { time:'晚上', title:'返回阿克套、晚餐、休息', maps:[['Dostyk Hotel Aktau','Dostyk Hotel Aktau']], note:'第二天回国', done:false }
    ]},
    { id:'1005', date:'10/5', week:'周一', items:[
      { time:'08:30–10:00', title:'早餐 / 里海最后散步', maps:[['阿克套海滨','Aktau Caspian Sea promenade']], note:'放松收尾', done:false },
      { time:'10:00–11:30', title:'整理行李、退房', maps:[['Dostyk Hotel Aktau','Dostyk Hotel Aktau']], note:'可寄存行李', done:false },
      { time:'11:30–12:30', title:'午餐', maps:[['Dostyk Hotel 周边','Dostyk Hotel Aktau restaurants']], note:'不建议排景点', done:false },
      { time:'12:30左右', title:'前往阿克套机场', maps:[['阿克套机场','Aktau International Airport']], note:'给国际联程留足时间', done:false },
      { time:'15:00–17:20', title:'阿克套 → 奇姆肯特 · DV710', badge:'已购', maps:[['阿克套机场','Aktau International Airport'],['奇姆肯特机场','Shymkent International Airport']], note:'—', done:false },
      { time:'17:20–19:10', title:'奇姆肯特转机', maps:[['奇姆肯特机场','Shymkent International Airport']], note:'转机 1 小时 50 分', done:false },
      { time:'19:10–次日04:55', title:'奇姆肯特 → 上海浦东 · DV461', badge:'已购', maps:[['奇姆肯特机场','Shymkent International Airport'],['上海浦东 T2','Shanghai Pudong International Airport Terminal 2']], note:'—', done:false }
    ]},
    { id:'1006', date:'10/6', week:'周二', items:[
      { time:'04:55', title:'抵达上海浦东', maps:[['上海浦东 T2','Shanghai Pudong International Airport Terminal 2']], note:'行程结束', done:false }
    ]}
  ]
};

