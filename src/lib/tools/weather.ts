import { tool } from "ai";
import { z } from "zod";

// ========== 城市经纬度数据 ==========

const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
    "北京": { lat: 39.9, lon: 116.4 },
    "上海": { lat: 31.2, lon: 121.5 },
    "广州": { lat: 23.1, lon: 113.3 },
    "深圳": { lat: 22.5, lon: 114.1 },
    "杭州": { lat: 30.3, lon: 120.2 },
    "成都": { lat: 30.6, lon: 104.1 },
    "武汉": { lat: 30.6, lon: 114.3 },
    "西安": { lat: 34.3, lon: 108.9 },
    "南京": { lat: 32.1, lon: 118.8 },
    "苏州": { lat: 31.3, lon: 120.6 },
    "重庆": { lat: 29.6, lon: 106.5 },
    "天津": { lat: 39.1, lon: 117.2 },
    "长沙": { lat: 28.2, lon: 113.0 },
    "青岛": { lat: 36.1, lon: 120.4 },
    "厦门": { lat: 24.5, lon: 118.1 },
    "昆明": { lat: 25.0, lon: 102.7 },
    "哈尔滨": { lat: 45.8, lon: 126.5 },
    "沈阳": { lat: 41.8, lon: 123.4 },
    "大连": { lat: 38.9, lon: 121.6 },
    "三亚": { lat: 18.3, lon: 109.5 },
    "香港": { lat: 22.3, lon: 114.2 },
    "台北": { lat: 25.0, lon: 121.5 },
    "澳门": { lat: 22.2, lon: 113.5 },
    "东京": { lat: 35.7, lon: 139.7 },
    "首尔": { lat: 37.6, lon: 127.0 },
    "新加坡": { lat: 1.35, lon: 103.8 },
    "曼谷": { lat: 13.8, lon: 100.5 },
    "纽约": { lat: 40.7, lon: -74.0 },
    "伦敦": { lat: 51.5, lon: -0.1 },
    "巴黎": { lat: 48.9, lon: 2.3 },
    "悉尼": { lat: -33.9, lon: 151.2 },
    "迪拜": { lat: 25.2, lon: 55.3 },
    "旧金山": { lat: 37.8, lon: -122.4 },
};

// ========== WMO 天气代码 → 中文 ==========

const WEATHER_CODES: Record<number, string> = {
    0: "晴天",
    1: "大部晴朗",
    2: "多云",
    3: "阴天",
    45: "有雾",
    48: "雾凇",
    51: "小毛毛雨",
    53: "毛毛雨",
    55: "大毛毛雨",
    61: "小雨",
    63: "中雨",
    65: "大雨",
    71: "小雪",
    73: "中雪",
    75: "大雪",
    80: "阵雨",
    81: "中阵雨",
    82: "大阵雨",
    95: "雷阵雨",
    96: "雷阵雨伴冰雹",
    99: "强雷阵雨伴冰雹",
};

function windLevel(kmh: number): string {
    if (kmh < 1) return "无风";
    if (kmh < 12) return "微风";
    if (kmh < 29) return "和风";
    if (kmh < 50) return "强风";
    return "大风";
}

/** 从用户消息文本中提取城市名 */
export function extractCity(text: string): string {
    for (const cn of Object.keys(CITY_COORDS)) {
        if (text.includes(cn)) return cn;
    }
    return "";
}

// ========== 工具定义 ==========

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getWeatherTool: any = tool({
    description: "获取指定城市的实时天气信息",
    parameters: z.object({
        city: z.string().describe("城市名称，例如：北京、上海、深圳"),
    }),
    inputExamples: [{ city: "北京" }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (input: any) => {
        const cityName: string = input.city || "";
        console.log(`[getWeather] 查询: "${cityName}"`);

        const coords = CITY_COORDS[cityName];
        if (!coords) {
            return { city: cityName, error: `暂不支持查询"${cityName}"的天气，支持的城市：${Object.keys(CITY_COORDS).join("、")}` };
        }

        const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m`;

        // 超时 + 错误处理
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);

            if (!response.ok) {
                return { city: cityName, error: `天气服务暂时不可用（HTTP ${response.status}），请稍后重试` };
            }

            const data = await response.json();
            if (!data.current) {
                return { city: cityName, error: "天气数据异常，请稍后重试" };
            }

            const c = data.current;
            const result = {
                city: cityName,
                temperature: Math.round(c.temperature_2m),
                feelsLike: Math.round(c.apparent_temperature),
                condition: WEATHER_CODES[c.weather_code] ?? `天气代码${c.weather_code}`,
                humidity: c.relative_humidity_2m,
                windSpeed: `${c.wind_speed_10m} km/h`,
                windLevel: windLevel(c.wind_speed_10m),
                unit: "摄氏度",
            };

            console.log(`[getWeather] 结果:`, JSON.stringify(result));
            return result;
        } catch (e) {
            clearTimeout(timeout);
            if ((e as Error).name === "AbortError") {
                return { city: cityName, error: "天气查询超时，请稍后重试" };
            }
            return { city: cityName, error: `网络异常: ${(e as Error).message}` };
        }
    },
});
