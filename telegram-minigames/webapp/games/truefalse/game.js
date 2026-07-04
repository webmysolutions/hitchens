/* True or False — 60-second rapid fact check. DOM UI, swipe or tap. */
(function () {
'use strict';
MG.register('truefalse', function (container, api) {
  var C = api.colors;
  var ru = api.lang === 'ru';
  var low = api.lowEnd;
  var TOTAL = 60000;

  /* [statementEN, statementRU, isTrue(1/0)] */
  var F = [
    ['Octopuses have three hearts.','У осьминога три сердца.',1],
    ['Honey can stay edible for thousands of years.','Мёд может оставаться съедобным тысячи лет.',1],
    ['A day on Venus lasts longer than its year.','Сутки на Венере длятся дольше её года.',1],
    ['Botanically, a banana is a berry.','С точки зрения ботаники банан — ягода.',1],
    ['Sharks appeared on Earth before trees.','Акулы появились на Земле раньше деревьев.',1],
    ['The Eiffel Tower gets taller in summer heat.','В летнюю жару Эйфелева башня становится выше.',1],
    ['Hot water can freeze faster than cold water.','Горячая вода может замёрзнуть быстрее холодной.',1],
    ['Australia is wider than the Moon.','Австралия шире Луны.',1],
    ['Venus is the hottest planet in the Solar System.','Венера — самая горячая планета Солнечной системы.',1],
    ['Sloths can hold their breath longer than dolphins.','Ленивцы задерживают дыхание дольше дельфинов.',1],
    ['Your body contains enough iron to make a small nail.','В теле человека хватит железа на небольшой гвоздь.',1],
    ['The national animal of Scotland is the unicorn.','Национальное животное Шотландии — единорог.',1],
    ['Butterflies taste food with their feet.','Бабочки чувствуют вкус лапками.',1],
    ['Wombats produce cube-shaped droppings.','Помёт вомбата имеет форму кубиков.',1],
    ['A blue whale\'s heart is about the size of a small car.','Сердце синего кита размером с небольшой автомобиль.',1],
    ['Antarctica is the largest desert on Earth.','Антарктида — крупнейшая пустыня на Земле.',1],
    ['Lake Baikal is the deepest lake in the world.','Байкал — самое глубокое озеро в мире.',1],
    ['Africa is the only continent in all four hemispheres.','Африка — единственный континент во всех четырёх полушариях.',1],
    ['Istanbul is located on two continents.','Стамбул расположен на двух континентах.',1],
    ['Canada has more lakes than the rest of the world combined.','В Канаде больше озёр, чем во всём остальном мире.',1],
    ['The Pacific Ocean is bigger than all land on Earth combined.','Тихий океан больше всей суши Земли вместе взятой.',1],
    ['Mount Everest gets a little taller every year.','Эверест каждый год становится немного выше.',1],
    ['Russia sold Alaska to the USA.','Россия продала Аляску США.',1],
    ['The Hundred Years\' War lasted more than a hundred years.','Столетняя война длилась больше ста лет.',1],
    ['Oxford University is older than the Aztec Empire.','Оксфордский университет старше империи ацтеков.',1],
    ['Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid.','Клеопатра жила ближе к высадке на Луну, чем к постройке Великой пирамиды.',1],
    ['Mammoths were still alive when the pyramids of Giza were built.','Мамонты ещё жили, когда строились пирамиды Гизы.',1],
    ['Napoleon was taller than the average Frenchman of his time.','Наполеон был выше среднего француза своего времени.',1],
    ['The shortest war in history lasted less than an hour.','Самая короткая война в истории длилась меньше часа.',1],
    ['Adults have fewer bones than newborn babies.','У взрослых меньше костей, чем у новорождённых.',1],
    ['Human ears and noses keep growing throughout life.','Уши и нос человека растут всю жизнь.',1],
    ['The human small intestine is about six meters long.','Тонкий кишечник человека — около шести метров в длину.',1],
    ['Weight for weight, human bone is stronger than concrete.','При равном весе кость человека прочнее бетона.',1],
    ['Fingernails grow faster than toenails.','Ногти на руках растут быстрее, чем на ногах.',1],
    ['A teaspoon of neutron star matter would weigh billions of tons.','Чайная ложка вещества нейтронной звезды весила бы миллиарды тонн.',1],
    ['There are more trees on Earth than stars in the Milky Way.','На Земле больше деревьев, чем звёзд в Млечном Пути.',1],
    ['Jupiter has the shortest day of all the planets.','У Юпитера самые короткие сутки среди планет.',1],
    ['Sunlight takes about eight minutes to reach Earth.','Свет Солнца летит до Земли около восьми минут.',1],
    ['Footprints on the Moon can last for millions of years.','Следы на Луне могут сохраняться миллионы лет.',1],
    ['Saturn is less dense than water.','Сатурн менее плотный, чем вода.',1],
    ['About a million Earths could fit inside the Sun.','Внутри Солнца поместилось бы около миллиона Земель.',1],
    ['The ISS circles Earth about 16 times a day.','МКС облетает Землю около 16 раз в сутки.',1],
    ['Space is completely silent.','В космосе царит полная тишина.',1],
    ['Olympus Mons on Mars is almost three times higher than Everest.','Гора Олимп на Марсе почти втрое выше Эвереста.',1],
    ['Cows form close friendships and get stressed when separated.','Коровы заводят близкую дружбу и скучают в разлуке.',1],
    ['Flamingos are pink because of the food they eat.','Фламинго розовые из-за пищи, которую они едят.',1],
    ['Sea otters hold hands while sleeping so they don\'t drift apart.','Каланы спят, держась за лапы, чтобы их не разнесло.',1],
    ['Snails can sleep for up to three years.','Улитки могут спать до трёх лет.',1],
    ['Koalas sleep up to 22 hours a day.','Коалы спят до 22 часов в сутки.',1],
    ['Dolphins sleep with one half of the brain awake.','Дельфины спят, отключая лишь половину мозга.',1],
    ['Crows can remember human faces.','Вороны запоминают человеческие лица.',1],
    ['Tigers have striped skin, not just striped fur.','У тигров полосатая не только шерсть, но и кожа.',1],
    ['Giraffes have the same number of neck vertebrae as humans.','У жирафа столько же шейных позвонков, сколько у человека.',1],
    ['Hippos produce a red liquid that works like sunscreen.','Бегемоты выделяют красную жидкость — природный крем от солнца.',1],
    ['Lightning is about five times hotter than the surface of the Sun.','Молния примерно в пять раз горячее поверхности Солнца.',1],
    ['Seen from space, the Sun is white, not yellow.','Из космоса Солнце выглядит белым, а не жёлтым.',1],
    ['Vikings reached America about 500 years before Columbus.','Викинги достигли Америки примерно за 500 лет до Колумба.',1],
    ['The Colosseum was sometimes flooded for mock naval battles.','Колизей иногда заливали водой для морских боёв.',1],
    ['The Statue of Liberty was a gift from France.','Статуя Свободы — подарок Франции.',1],
    ['The Moon drifts a few centimeters away from Earth every year.','Луна каждый год отдаляется от Земли на несколько сантиметров.',1],
    ['The Dead Sea is so salty that swimmers float easily.','Мёртвое море настолько солёное, что люди легко держатся на воде.',1],
    ['Finland has more saunas than cars.','В Финляндии саун больше, чем автомобилей.',1],
    ['About a third of the Netherlands lies below sea level.','Около трети Нидерландов лежит ниже уровня моря.',1],
    ['The Vatican is the smallest country in the world.','Ватикан — самое маленькое государство в мире.',1],
    ['Measured from its underwater base, Mauna Kea is taller than Everest.','От подводного основания Мауна-Кеа выше Эвереста.',1],
    ['Some bamboo can grow almost a meter in a single day.','Некоторые виды бамбука вырастают почти на метр за день.',1],
    ['Bees tell each other where flowers are by dancing.','Пчёлы сообщают друг другу о цветах с помощью танца.',1],
    ['Rats giggle when they are tickled.','Крысы «смеются», когда их щекочут.',1],
    ['Cats cannot taste sweetness.','Кошки не чувствуют сладкий вкус.',1],
    ['Horses are physically unable to vomit.','Лошади физически не способны к рвоте.',1],
    ['The first human in space was launched by the USSR.','Первого человека в космос отправил СССР.',1],
    ['The Titanic sank on its very first voyage.','«Титаник» затонул в своём первом рейсе.',1],
    ['The Great Wall of China is visible from the Moon.','Великая Китайская стена видна с Луны.',0],
    ['Goldfish remember things for only three seconds.','Золотые рыбки помнят всё лишь три секунды.',0],
    ['Humans use only 10% of their brains.','Человек использует лишь 10% мозга.',0],
    ['Lightning never strikes the same place twice.','Молния никогда не бьёт дважды в одно место.',0],
    ['Bats are completely blind.','Летучие мыши совершенно слепы.',0],
    ['Bulls become enraged by the color red.','Быков приводит в ярость красный цвет.',0],
    ['Shaving makes hair grow back thicker.','После бритья волосы отрастают гуще.',0],
    ['Sugar makes children hyperactive.','Сахар делает детей гиперактивными.',0],
    ['Swimming right after a meal causes dangerous cramps.','Плавание сразу после еды вызывает опасные судороги.',0],
    ['People swallow about eight spiders a year in their sleep.','Во сне человек проглатывает около восьми пауков в год.',0],
    ['Cracking your knuckles causes arthritis.','Хруст пальцами вызывает артрит.',0],
    ['Hair and nails keep growing after death.','Волосы и ногти продолжают расти после смерти.',0],
    ['Different zones of the tongue sense different tastes.','Разные зоны языка отвечают за разные вкусы.',0],
    ['You lose most of your body heat through your head.','Большую часть тепла тело теряет через голову.',0],
    ['Vikings wore horned helmets in battle.','Викинги сражались в рогатых шлемах.',0],
    ['Einstein failed math at school.','Эйнштейн проваливал математику в школе.',0],
    ['In Columbus\'s time most people believed the Earth was flat.','Во времена Колумба большинство считало Землю плоской.',0],
    ['Marie Antoinette said: "Let them eat cake."','Мария-Антуанетта сказала: «Пусть едят пирожные».',0],
    ['Roman gladiator fights almost always ended in death.','Бои гладиаторов почти всегда заканчивались смертью.',0],
    ['Walt Disney\'s body is cryogenically frozen.','Тело Уолта Диснея заморожено в криокамере.',0],
    ['Cheese is a mouse\'s favorite food.','Сыр — любимая еда мышей.',0],
    ['Frightened ostriches bury their heads in the sand.','Испуганный страус прячет голову в песок.',0],
    ['Chameleons change color mainly for camouflage.','Хамелеоны меняют цвет в основном для маскировки.',0],
    ['Camels store water in their humps.','Верблюды хранят воду в горбах.',0],
    ['Dogs see the world in black and white.','Собаки видят мир чёрно-белым.',0],
    ['A duck\'s quack does not echo.','Кряканье утки не даёт эха.',0],
    ['Touching a frog gives you warts.','От прикосновения к лягушке появляются бородавки.',0],
    ['Lemmings jump off cliffs in mass suicide.','Лемминги массово прыгают со скал, совершая самоубийство.',0],
    ['Bananas grow on trees.','Бананы растут на деревьях.',0],
    ['The Sahara is the largest desert on Earth.','Сахара — крупнейшая пустыня Земли.',0],
    ['The Amazon is the longest river in the world.','Амазонка — самая длинная река в мире.',0],
    ['Sydney is the capital of Australia.','Сидней — столица Австралии.',0],
    ['Africa is the largest continent.','Африка — самый большой континент.',0],
    ['The Atlantic is the largest ocean on Earth.','Атлантический океан — самый большой на Земле.',0],
    ['Penguins live at the North Pole.','Пингвины живут на Северном полюсе.',0],
    ['Polar bears hunt penguins in the wild.','Белые медведи охотятся на пингвинов в дикой природе.',0],
    ['Mars is red because its surface is burning hot.','Марс красный, потому что его поверхность раскалена.',0],
    ['The far side of the Moon never gets sunlight.','Обратная сторона Луны никогда не освещается Солнцем.',0],
    ['There is no gravity aboard the ISS.','На борту МКС нет гравитации.',0],
    ['Shooting stars are real stars falling from the sky.','Падающие звёзды — это настоящие звёзды, падающие с неба.',0],
    ['Mercury is the hottest planet because it is closest to the Sun.','Меркурий — самая горячая планета, ведь он ближе всех к Солнцу.',0],
    ['Sound travels faster in air than in water.','Звук распространяется в воздухе быстрее, чем в воде.',0],
    ['Old window glass is thicker at the bottom because glass slowly flows.','Старые стёкла толще внизу, потому что стекло медленно течёт.',0],
    ['A coin dropped from a skyscraper can kill a pedestrian.','Монета, брошенная с небоскрёба, может убить прохожего.',0],
    ['Drinking alcohol warms the body in cold weather.','Алкоголь согревает тело в мороз.',0],
    ['Blood inside your veins is blue until it meets oxygen.','Кровь в венах синяя, пока не встретится с кислородом.',0],
    ['Humans have exactly five senses.','У человека ровно пять чувств.',0],
    ['Eating carrots lets you see in the dark.','Морковь позволяет видеть в темноте.',0],
    ['Waking a sleepwalker can kill them.','Разбудить лунатика смертельно опасно.',0],
    ['Fortune cookies are an ancient Chinese invention.','Печенье с предсказаниями — древнее китайское изобретение.',0],
    ['French fries were invented in France.','Картофель фри придумали во Франции.',0],
    ['The composer Salieri poisoned Mozart.','Композитор Сальери отравил Моцарта.',0],
    ['Newton discovered gravity when an apple hit him on the head.','Ньютон открыл тяготение после удара яблоком по голове.',0],
    ['Thomas Edison invented the first light bulb.','Томас Эдисон изобрёл первую лампочку.',0],
    ['Summer is warm because Earth is closer to the Sun.','Летом тепло, потому что Земля ближе к Солнцу.',0],
    ['All deserts are hot.','Все пустыни — жаркие.',0],
    ['Sharks never get cancer.','Акулы никогда не болеют раком.',0],
    ['A mother bird abandons chicks touched by humans.','Птица бросает птенцов, если их коснулся человек.',0],
    ['Elephants are afraid of mice.','Слоны боятся мышей.',0],
    ['A dog\'s mouth is cleaner than a human\'s.','Пасть собаки чище человеческого рта.',0],
    ['Every bee dies after it stings.','Любая пчела погибает после того, как ужалит.',0],
    ['Moss always grows on the north side of trees.','Мох всегда растёт с северной стороны деревьев.',0],
    ['The pyramids of Giza were built by slaves.','Пирамиды Гизы строили рабы.',0],
    ['Julius Caesar was born by caesarean section.','Юлий Цезарь родился с помощью кесарева сечения.',0],
    ['Venice stands on floating platforms.','Венеция стоит на плавучих платформах.',0],
    ['The Leaning Tower of Pisa was built tilted on purpose.','Пизанскую башню специально построили наклонной.',0],
    ['In Australia water drains in the opposite direction because of Earth\'s rotation.','В Австралии вода в раковине закручивается в другую сторону из-за вращения Земли.',0],
    ['Swallowed chewing gum stays in your stomach for seven years.','Проглоченная жвачка остаётся в желудке семь лет.',0],
    ['You must drink exactly eight glasses of water every day.','Каждый день нужно выпивать ровно восемь стаканов воды.',0],
    ['Reading in dim light permanently damages your eyes.','Чтение при тусклом свете необратимо портит зрение.',0],
    ['Identical twins have identical fingerprints.','У однояйцевых близнецов одинаковые отпечатки пальцев.',0],
    ['Antibiotics kill viruses.','Антибиотики убивают вирусы.',0]
  ];

  var score = 0, streak = 0, oi = 0, timeLeft = TOTAL;
  var running = false, paused = false, locked = true;
  var iv = 0, timers = [];
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function rnd(n) { return (Math.random() * n) | 0; }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  var order = (function () {
    var idxs = [];
    for (var i = 0; i < F.length; i++) idxs.push(i);
    return shuffle(idxs);
  })();

  /* ---- DOM ---- */
  container.style.background = C.bg;
  var wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;max-width:480px;margin:0 auto;' +
    'display:flex;flex-direction:column;padding:14px;box-sizing:border-box;font-family:sans-serif;overflow:hidden;';

  var hud = document.createElement('div');
  hud.style.cssText = 'display:flex;justify-content:space-between;align-items:center;min-height:24px;margin-bottom:6px;';
  var timeTxt = document.createElement('div');
  timeTxt.style.cssText = 'color:' + C.muted + ';font-weight:600;font-size:15px;';
  var flame = document.createElement('div');
  flame.style.cssText = 'color:' + C.accent + ';font-weight:700;font-size:16px;';
  hud.appendChild(timeTxt);
  hud.appendChild(flame);

  var barOuter = document.createElement('div');
  barOuter.style.cssText = 'height:8px;border-radius:5px;background:' + C.panel + ';overflow:hidden;';
  var bar = document.createElement('div');
  bar.style.cssText = 'height:100%;width:100%;background:' + C.accent + ';border-radius:5px;' +
    (low ? '' : 'transition:width .1s linear;');
  barOuter.appendChild(bar);

  var mid = document.createElement('div');
  mid.style.cssText = 'flex:1;display:flex;align-items:center;min-height:0;overflow:hidden;';
  var card = document.createElement('div');
  var TR = 'transform .2s ease,opacity .2s ease';
  card.style.cssText = 'width:100%;box-sizing:border-box;background:' + C.panel + ';color:' + C.text + ';' +
    'border:2px solid ' + C.panel2 + ';border-radius:16px;padding:22px 18px;font-weight:600;font-size:20px;' +
    'line-height:1.35;text-align:center;user-select:none;' + (low ? '' : 'transition:' + TR + ';');
  var stmt = document.createElement('div');
  var verdict = document.createElement('div');
  verdict.style.cssText = 'min-height:22px;margin-top:12px;font-weight:800;font-size:16px;';
  card.appendChild(stmt);
  card.appendChild(verdict);
  mid.appendChild(card);

  var hint = document.createElement('div');
  hint.style.cssText = 'color:' + C.muted + ';font-size:12px;text-align:center;margin:4px 0 8px;';
  hint.textContent = ru ? '← ложь · свайп · правда →' : '← false · swipe · true →';

  var row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:12px;padding-bottom:6px;';
  function mkBtn(sym, col) {
    var b = document.createElement('div');
    b.style.cssText = 'flex:1;padding:16px 0;border-radius:14px;text-align:center;font-weight:800;font-size:30px;' +
      'background:' + C.panel + ';border:2px solid ' + col + ';color:' + col + ';' +
      'touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;';
    b.textContent = sym;
    return b;
  }
  var btnF = mkBtn('✖', C.bad), btnT = mkBtn('✔', C.good);
  btnF.addEventListener('pointerdown', function (e) { e.preventDefault(); answer(false); });
  btnT.addEventListener('pointerdown', function (e) { e.preventDefault(); answer(true); });
  row.appendChild(btnF);
  row.appendChild(btnT);

  wrap.appendChild(hud);
  wrap.appendChild(barOuter);
  wrap.appendChild(mid);
  wrap.appendChild(hint);
  wrap.appendChild(row);
  container.appendChild(wrap);

  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;' +
    'justify-content:center;background:rgba(0,0,0,.45);color:' + C.text + ';font:700 20px sans-serif;';
  overlay.textContent = api.t('tap_to_start');
  container.appendChild(overlay);

  function updateHud() {
    timeTxt.textContent = Math.max(0, Math.ceil(timeLeft / 1000)) + (ru ? ' с' : ' s');
    flame.textContent = streak >= 2 ? '🔥x' + streak : '';
  }

  function showCard() {
    if (oi >= order.length) { shuffle(order); oi = 0; }
    var f = F[order[oi]];
    stmt.textContent = ru ? f[1] : f[0];
    verdict.textContent = '';
    card.style.borderColor = C.panel2;
    locked = false;
  }

  function slideIn(fromRight) {
    if (low) { showCard(); return; }
    card.style.transition = 'none';
    card.style.transform = 'translateX(' + (fromRight ? 110 : -110) + '%)';
    card.style.opacity = '0';
    showCard();
    void card.offsetWidth; /* reflow */
    card.style.transition = TR;
    card.style.transform = 'translateX(0)';
    card.style.opacity = '1';
  }

  function answer(v) {
    if (!running || locked || paused) return;
    locked = true;
    var f = F[order[oi]];
    var truth = f[2] === 1;
    if (v === truth) {
      var gain = 10 + 2 * streak;
      score += gain;
      streak++;
      api.score(score);
      api.haptic(streak % 5 === 0 ? 'success' : 'light');
      card.style.borderColor = C.good;
      verdict.style.color = C.good;
      verdict.textContent = (truth ? (ru ? '✔ Правда' : '✔ True') : (ru ? '✔ Ложь' : '✔ False')) + '  +' + gain;
    } else {
      score = Math.max(0, score - 5);
      streak = 0;
      api.score(score);
      api.haptic('error');
      card.style.borderColor = C.bad;
      verdict.style.color = C.bad;
      verdict.textContent = truth ? (ru ? '✘ Это правда' : '✘ It was true') : (ru ? '✘ Это ложь' : '✘ It was false');
    }
    updateHud();
    later(function () {
      if (!running) return;
      if (!low) {
        card.style.transform = 'translateX(' + (v ? 110 : -110) + '%)';
        card.style.opacity = '0';
        later(function () {
          if (!running) return;
          oi++;
          slideIn(!v);
        }, 200);
      } else {
        oi++;
        showCard();
      }
    }, 420);
  }

  function tick() {
    if (!running || paused) return;
    timeLeft -= 100;
    bar.style.width = Math.max(0, timeLeft / TOTAL * 100) + '%';
    if (timeLeft <= 10000) bar.style.background = C.bad;
    updateHud();
    if (timeLeft <= 0) {
      running = false;
      clearInterval(iv);
      api.haptic('medium');
      api.gameOver(score);
    }
  }

  function start() {
    if (running) return;
    overlay.style.display = 'none';
    running = true;
    api.score(0);
    updateHud();
    showCard();
    iv = setInterval(tick, 100);
  }
  overlay.addEventListener('pointerdown', function (e) { e.preventDefault(); start(); });

  var offSwipe = api.swipe(container, function (d) {
    if (!running) return;
    if (d === 'right') answer(true);
    else if (d === 'left') answer(false);
  });

  function onKey(e) {
    if (!running && (e.key === ' ' || e.key === 'Enter')) { start(); e.preventDefault(); return; }
    if (e.key === 'ArrowRight') { answer(true); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { answer(false); e.preventDefault(); }
  }
  window.addEventListener('keydown', onKey);
  updateHud();

  return {
    destroy: function () {
      clearInterval(iv);
      for (var k = 0; k < timers.length; k++) clearTimeout(timers[k]);
      timers.length = 0;
      window.removeEventListener('keydown', onKey);
      offSwipe();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
