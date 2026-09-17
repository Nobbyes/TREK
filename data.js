/* Public itinerary only. Never place booking references or credentials here. */
window.TREK_DATA = {
  updated: '2026-09-17',
  source: 'https://app.notion.com/p/3dc053444bde8099b522d98807bb2158?pvs=204',
  savedMap: 'https://maps.app.goo.gl/JQUJwBDUwqy2TfQP9',
  savedMapUpdated: 'https://maps.app.goo.gl/y1Kww3mHPbMZbS1c8',
  savedPlaces: window.TREK_SAVED_PLACES || [],
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
    { id:'ca779', date:'09.25', mode:'flight', code:'CA779', from:'重庆江北 T3', to:'塔什干国际 T2', dep:'17:15', arr:'23:35', who:'两人同行', confirmed:true, note:'按本对话航班截图记录 23:35 抵达；旧对话曾写 23:55。酒店深夜入住需以酒店回复为准。' },
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
  ]
};

