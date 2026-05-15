// Data lifted from kazoboron/respawn-kz · src/data/{clubs,cities,content}.ts
// Kept verbatim so visuals match production.

window.CITIES = [
  { id: 'almaty', label: 'Алматы' },
  { id: 'astana', label: 'Астана' },
  { id: 'shymkent', label: 'Шымкент' },
  { id: 'karaganda', label: 'Караганда' },
  { id: 'aktobe', label: 'Актобе' },
  { id: 'taraz', label: 'Тараз' },
  { id: 'pavlodar', label: 'Павлодар' },
  { id: 'oskemen', label: 'Усть-Каменогорск' },
  { id: 'semey', label: 'Семей' },
  { id: 'atyrau', label: 'Атырау' },
];
window.CITY_LABELS = Object.fromEntries(window.CITIES.map(c => [c.id, c.label]));

window.CLUBS = [
  { slug:'cyberzone', name:'Cyberzone', initial:'C', gradient:'linear-gradient(135deg, #00f0ff, #0066ff)', city:'almaty', district:'Алмалинский р-н', address:'ул. Абая, 150', phone:'+7 (727) 123-45-67', hours:'Круглосуточно', rating:4.9, reviews:312, price:1200, tags:['PC','PS5','VR'],
    description:'Cyberzone — флагманский клуб с премиум-оборудованием в центре Алматы. RTX 4080, мониторы 240Hz, профессиональная периферия Razer. Зоны для одиночных игроков, кооператива и киберспортивных команд. VR-кабины с играми Beat Saber и Half-Life: Alyx.',
    equipment:['RTX 4080 / i7-13700K','Мониторы 240Hz LG UltraGear','Razer DeathAdder V3','Razer BlackShark V2 Pro','Кресла Secretlab Titan','2 VR-кабины Meta Quest 3'],
    gg:['linear-gradient(135deg, #00f0ff, #0066ff)','linear-gradient(135deg, #0066ff, #8b00ff)','linear-gradient(45deg, #00f0ff, #14141c)','linear-gradient(135deg, #14141c, #0066ff)'] },
  { slug:'gamerhub', name:'GamerHub', initial:'G', gradient:'linear-gradient(135deg, #8b00ff, #ff2e9a)', city:'almaty', district:'Бостандыкский р-н', address:'пр. Аль-Фараби, 77', phone:'+7 (727) 234-56-78', hours:'10:00–02:00', rating:4.8, reviews:145, price:900, tags:['PC','VR'],
    description:'GamerHub — уютный клуб с акцентом на комфорт. Тихие игровые зоны, отдельная VR-комната, кафе с домашней едой.',
    equipment:['RTX 4070 / i5-13600K','Мониторы 165Hz','Logitech G Pro X','Кресла DXRacer','VR-комната Meta Quest 3'],
    gg:['linear-gradient(135deg, #8b00ff, #ff2e9a)','linear-gradient(45deg, #ff2e9a, #14141c)','linear-gradient(135deg, #8b00ff, #14141c)','linear-gradient(45deg, #14141c, #ff2e9a)'] },
  { slug:'colizeum-astana', name:'Colizeum', initial:'C', gradient:'linear-gradient(135deg, #ff2e9a, #8b00ff)', city:'astana', district:'Есильский р-н', address:'пр. Кабанбай батыра, 11', phone:'+7 (7172) 12-34-56', hours:'Круглосуточно', rating:4.8, reviews:189, price:1500, tags:['PC','Sim Racing'],
    description:'Colizeum — самый большой компьютерный клуб столицы. 60 рабочих мест, симуляторы гонок Logitech G Pro Racing, отдельные VIP-кабины для стримеров. Регулярные турниры по CS2 и Dota 2.',
    equipment:['RTX 4080 / i7-14700K','Мониторы 360Hz','6 Sim Racing кабин Logitech G Pro','Профессиональные стримерские установки','Кресла Secretlab'],
    gg:['linear-gradient(135deg, #ff2e9a, #8b00ff)','linear-gradient(45deg, #8b00ff, #00f0ff)','linear-gradient(135deg, #14141c, #ff2e9a)','linear-gradient(45deg, #ff2e9a, #00f0ff)'] },
  { slug:'nexus-astana', name:'Nexus', initial:'N', gradient:'linear-gradient(135deg, #00f0ff, #ff2e9a)', city:'astana', district:'Сарыаркинский р-н', address:'ул. Республики, 24', phone:'+7 (7172) 23-45-67', hours:'09:00–03:00', rating:4.7, reviews:124, price:1100, tags:['PC','PS5'],
    description:'Nexus — клуб для тех, кто любит и PC, и консоли. 40 PC-мест, 8 PS5-зон с большими ТВ. Семейные пакеты выходного дня, безалкогольный бар.',
    equipment:['RTX 4070 Ti / i7-13700','Мониторы 240Hz','8 PS5 с играми FIFA, Mortal Kombat','Razer периферия','Кресла DXRacer'],
    gg:['linear-gradient(135deg, #00f0ff, #ff2e9a)','linear-gradient(45deg, #ff2e9a, #14141c)','linear-gradient(135deg, #14141c, #00f0ff)','linear-gradient(45deg, #00f0ff, #8b00ff)'] },
  { slug:'rage-arena', name:'RAGE Arena', initial:'R', gradient:'linear-gradient(135deg, #fef300, #ff6a00)', city:'shymkent', district:'Аль-Фарабийский р-н', address:'ул. Тауке хана, 5', phone:'+7 (7252) 12-34-56', hours:'Круглосуточно', rating:4.7, reviews:256, price:1000, tags:['PC','PS5'],
    description:'RAGE Arena — крупнейший киберспортивный клуб на юге Казахстана. Хост региональных турниров по Counter-Strike. Профессиональная звукоизоляция.',
    equipment:['RTX 4070 / i5-13600KF','Мониторы 240Hz BenQ Zowie','HyperX Cloud III','6 PS5 с VR2','Кресла Secretlab'],
    gg:['linear-gradient(135deg, #fef300, #ff6a00)','linear-gradient(45deg, #ff6a00, #14141c)','linear-gradient(135deg, #14141c, #fef300)','linear-gradient(45deg, #fef300, #ff2e9a)'] },
  { slug:'ignite-karaganda', name:'IGNITE', initial:'I', gradient:'linear-gradient(135deg, #ff2e9a, #00f0ff)', city:'karaganda', district:'Казыбек би р-н', address:'пр. Бухар жырау, 67', phone:'+7 (7212) 12-34-56', hours:'10:00–02:00', rating:4.6, reviews:98, price:800, tags:['PC'],
    description:'IGNITE — современный клуб для соревновательных игр в Караганде. Турниры по CS2 и Valorant каждые выходные.',
    equipment:['RTX 4060 Ti / i5-13400','Мониторы 165Hz','Razer DeathAdder','Кресла DXRacer'],
    gg:['linear-gradient(135deg, #ff2e9a, #00f0ff)','linear-gradient(45deg, #00f0ff, #14141c)','linear-gradient(135deg, #14141c, #ff2e9a)','linear-gradient(45deg, #ff2e9a, #fef300)'] },
  { slug:'netgame-aktobe', name:'NetGame', initial:'N', gradient:'linear-gradient(135deg, #00f0ff, #14141c)', city:'aktobe', district:'Центр', address:'пр. Абилкайыр хана, 38', phone:'+7 (7132) 12-34-56', hours:'12:00–00:00', rating:4.5, reviews:67, price:600, tags:['PC','PS5'],
    description:'NetGame — уютный семейный клуб с лучшими ценами в Актобе.',
    equipment:['RTX 3060 / i5-12400','Мониторы 144Hz','Logitech G102','4 PS5'],
    gg:['linear-gradient(135deg, #00f0ff, #14141c)','linear-gradient(45deg, #14141c, #00f0ff)','linear-gradient(135deg, #0066ff, #14141c)','linear-gradient(45deg, #14141c, #0066ff)'] },
  { slug:'playzone-taraz', name:'PlayZone', initial:'P', gradient:'linear-gradient(135deg, #8b00ff, #00f0ff)', city:'taraz', district:'Центр', address:'ул. Толе би, 75', phone:'+7 (7262) 12-34-56', hours:'10:00–01:00', rating:4.6, reviews:54, price:700, tags:['PC','PS5'],
    description:'PlayZone — первый современный компьютерный клуб в Таразе.',
    equipment:['RTX 4060 / i5-13400','Мониторы 165Hz','Razer периферия','4 PS5'],
    gg:['linear-gradient(135deg, #8b00ff, #00f0ff)','linear-gradient(45deg, #00f0ff, #14141c)','linear-gradient(135deg, #14141c, #8b00ff)','linear-gradient(45deg, #8b00ff, #ff2e9a)'] },
  { slug:'respawn-pavlodar', name:'Respawn Café', initial:'R', gradient:'linear-gradient(135deg, #00f0ff, #fef300)', city:'pavlodar', district:'Центр', address:'ул. Лермонтова, 12', phone:'+7 (7182) 12-34-56', hours:'11:00–00:00', rating:4.5, reviews:43, price:750, tags:['PC'],
    description:'Respawn Café — клуб-кафе с акцентом на атмосферу.',
    equipment:['RTX 4060 / i5-13400','Мониторы 165Hz','Logitech G Pro','Кресла DXRacer'],
    gg:['linear-gradient(135deg, #00f0ff, #fef300)','linear-gradient(45deg, #fef300, #14141c)','linear-gradient(135deg, #14141c, #00f0ff)','linear-gradient(45deg, #00f0ff, #ff6a00)'] },
];

window.LANDING_FAQ = [
  { q:'Как оплачивать бронирование?', a:'Картами Visa, Mastercard или через Kaspi. Деньги списываются после подтверждения брони. Никакой предоплаты администратору клуба не нужно.' },
  { q:'Можно ли отменить бронь?', a:'Да. Бесплатная отмена за 2 часа до начала. Если отменяешь позже — комиссия 50%. Полностью без штрафа можно отменить ночные брони (после 23:00) за 4 часа.' },
  { q:'Что если я опоздаю?', a:'Слот ждёт 15 минут после старта. Дальше место может быть передано следующему игроку, оплаченное время — сгорает.' },
  { q:'Это безопасно? Где мои деньги?', a:'Платежи защищены через PCI DSS-сертифицированного процессинга. Мы не храним данные карт. Возвраты приходят в течение 3-5 рабочих дней.' },
  { q:'Куда писать если проблема?', a:'Telegram @respawn_kz_support — отвечаем 24/7. Или email hello@respawn.kz — отвечаем в течение часа в рабочее время.' },
];

window.formatPrice = (n) => n.toLocaleString('ru-RU');
