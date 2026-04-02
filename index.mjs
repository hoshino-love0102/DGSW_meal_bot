import { Client, GatewayIntentBits } from 'discord.js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const {
  DISCORD_TOKEN,
  NEIS_API_KEY,
  ATPT_OFCDC_SC_CODE,
  SD_SCHUL_CODE,
} = process.env;

if (!DISCORD_TOKEN || !NEIS_API_KEY || !ATPT_OFCDC_SC_CODE || !SD_SCHUL_CODE) {
  throw new Error('환경변수가 비어 있습니다. .env를 확인하세요.');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

function getKstDate(offsetDays = 0) {
  const now = new Date();
  const kstString = now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' });
  const kstDate = new Date(kstString);
  kstDate.setDate(kstDate.getDate() + offsetDays);

  const year = kstDate.getFullYear();
  const month = String(kstDate.getMonth() + 1).padStart(2, '0');
  const day = String(kstDate.getDate()).padStart(2, '0');

  return {
    ymd: `${year}${month}${day}`,
    pretty: `${year}-${month}-${day}`,
  };
}

function cleanMenus(dishName = '') {
  return dishName
    .split('<br/>')
    .map(v => v.trim())
    .map(v => v.replace(/\s*\(.*?\)\s*/g, ''))
    .map(v => v.replace(/[0-9.]+$/g, ''))
    .map(v => v.replace(/[*\-+]/g, ''))
    .map(v => v.trim())
    .filter(Boolean);
}

function mealCodeToLabel(code) {
  if (code === '1') return '아침';
  if (code === '2') return '점심';
  if (code === '3') return '저녁';
  return '기타';
}

async function fetchMealsByDate(ymd) {
  const url = 'https://open.neis.go.kr/hub/mealServiceDietInfo';

  const response = await axios.get(url, {
    params: {
      KEY: NEIS_API_KEY,
      Type: 'json',
      pIndex: 1,
      pSize: 100,
      ATPT_OFCDC_SC_CODE,
      SD_SCHUL_CODE,
      MLSV_FROM_YMD: ymd,
      MLSV_TO_YMD: ymd,
    },
    timeout: 10000,
  });

  const rows = response.data?.mealServiceDietInfo?.flatMap(v => v.row ?? []) ?? [];

  return rows.map(row => ({
    mealType: mealCodeToLabel(row.MMEAL_SC_CODE),
    calorie: row.CAL_INFO ?? '',
    menus: cleanMenus(row.DDISH_NM ?? ''),
  }));
}

function findMeal(meals, targetType) {
  return meals.find(meal => meal.mealType === targetType);
}

function formatSingleMeal(dateText, mealType, meal) {
  if (!meal) {
    return `${dateText} ${mealType} 급식 정보가 없어요.`;
  }

  const menuText = meal.menus.length
    ? meal.menus.map(menu => `- ${menu}`).join('\n')
    : '- 메뉴 정보 없음';

  const calorieText = meal.calorie ? `\n칼로리: ${meal.calorie}` : '';

  return `${dateText} ${mealType}\n${menuText}${calorieText}`;
}

function formatAllMeals(dateText, meals) {
  if (!meals.length) {
    return `${dateText}\n급식 정보가 없어요.`;
  }

  return [
    `${dateText}`,
    ...meals.map(meal => {
      const menuText = meal.menus.length
        ? meal.menus.map(menu => `- ${menu}`).join('\n')
        : '- 메뉴 정보 없음';

      const calorieText = meal.calorie ? `\n칼로리: ${meal.calorie}` : '';
      return `\n[${meal.mealType}]\n${menuText}${calorieText}`;
    }),
  ].join('\n');
}

client.once('clientReady', () => {
  console.log(`봇 로그인 완료: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;

    const content = message.content.trim();

    if (!content.startsWith('!')) return;

    if (
      content !== '!아침' &&
      content !== '!점심' &&
      content !== '!저녁' &&
      content !== '!급식' &&
      content !== '!내일급식'
    ) {
      return;
    }

    const isTomorrow = content === '!내일급식';
    const { ymd, pretty } = getKstDate(isTomorrow ? 1 : 0);
    const meals = await fetchMealsByDate(ymd);

    if (content === '!급식' || content === '!내일급식') {
      await message.reply(formatAllMeals(pretty, meals));
      return;
    }

    if (content === '!아침') {
      await message.reply(formatSingleMeal(pretty, '아침', findMeal(meals, '아침')));
      return;
    }

    if (content === '!점심') {
      await message.reply(formatSingleMeal(pretty, '점심', findMeal(meals, '점심')));
      return;
    }

    if (content === '!저녁') {
      await message.reply(formatSingleMeal(pretty, '저녁', findMeal(meals, '저녁')));
    }
  } catch (error) {
    console.error(error);
    await message.reply('급식 조회 중 오류가 발생했어요.');
  }
});

await client.login(DISCORD_TOKEN);