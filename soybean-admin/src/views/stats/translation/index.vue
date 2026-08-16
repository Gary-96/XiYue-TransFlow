<script setup lang="ts">
import { ref } from 'vue';
import * as echarts from 'echarts';
import { NCard, NSpace, NTag } from 'naive-ui';
import { onMounted, onUnmounted, ref as vueRef } from 'vue';

// 翻译趋势数据
const trendChartRef = vueRef<HTMLElement>();
let trendChart: echarts.ECharts | null = null;

// 平台分布数据
const pieChartRef = vueRef<HTMLElement>();
let pieChart: echarts.ECharts | null = null;

// 实时统计
const stats = ref({
  totalTranslations: 135000,
  todayTranslations: 2847,
  activeUsers: 1050,
  avgResponseTime: '1.2s'
});

// 最近翻译记录（只保留抖音和TikTok）
const recentRecords = ref([
  { id: 1, user: '用户A', platform: '抖音直播', source: '越南语', target: '中文', duration: '2.3s', time: '10:23:45' },
  { id: 2, user: '用户B', platform: 'TikTok Live', source: '越南语', target: '中文', duration: '1.8s', time: '10:22:12' },
  { id: 3, user: '用户C', platform: '抖音直播', source: '越南语', target: '中文', duration: '2.1s', time: '10:20:58' },
  { id: 4, user: '用户D', platform: 'TikTok Live', source: '越南语', target: '中文', duration: '1.5s', time: '10:18:33' },
  { id: 5, user: '用户E', platform: '抖音直播', source: '越南语', target: '中文', duration: '2.0s', time: '10:15:20' }
]);

// 图表配置
const trendOption = {
  tooltip: { trigger: 'axis' },
  legend: { data: ['翻译次数', '激活用户'] },
  xAxis: { type: 'category', data: ['1月', '2月', '3月', '4月', '5月', '6月', '7月'] },
  yAxis: { type: 'value' },
  series: [
    { name: '翻译次数', type: 'line', data: [12500, 15800, 18200, 22000, 19500, 25000, 28000], smooth: true },
    { name: '激活用户', type: 'line', data: [320, 450, 580, 720, 680, 890, 1050], smooth: true }
  ]
};

const pieOption = {
  tooltip: { trigger: 'item' },
  legend: { orient: 'vertical', left: 'left' },
  series: [{
    type: 'pie',
    radius: ['40%', '70%'],
    avoidLabelOverlap: false,
    itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
    label: { show: false },
    data: [
      { name: '抖音直播', value: 65 },
      { name: 'TikTok Live', value: 35 }
    ]
  }]
};

// 平台颜色映射
const platformColors: Record<string, { bg: string; border: string; text: string }> = {
  '抖音直播': { bg: '#eff6ff', border: '#1677ff', text: '#1677ff' },
  'TikTok Live': { bg: '#ecfeff', border: '#25f4ee', text: '#0891b2' }
};

function getPlatformTag(platform: string) {
  const colors = platformColors[platform] || { bg: '#f3f4f6', border: '#d1d5db', text: '#6b7280' };
  return {
    type: 'default' as const,
    color: 'white' as const,
    borderColor: colors.border,
    textColor: colors.text
  };
}

function initCharts() {
  if (trendChartRef.value) {
    trendChart = echarts.init(trendChartRef.value);
    trendChart.setOption(trendOption);
  }
  if (pieChartRef.value) {
    pieChart = echarts.init(pieChartRef.value);
    pieChart.setOption(pieOption);
  }
}

function handleResize() {
  trendChart?.resize();
  pieChart?.resize();
}

onMounted(() => {
  initCharts();
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  trendChart?.dispose();
  pieChart?.dispose();
  window.removeEventListener('resize', handleResize);
});
</script>

<template>
  <div class="p-16px">
    <!-- 统计卡片 -->
    <NSpace :size="16" class="mb-16px" wrap>
      <NCard size="small" class="flex-1 min-w-200px">
        <div class="text-center">
          <div class="text-32px font-bold text-primary">{{ stats.totalTranslations.toLocaleString() }}</div>
          <div class="text-gray-500 text-12px mt-4px">累计翻译次数</div>
        </div>
      </NCard>
      <NCard size="small" class="flex-1 min-w-200px">
        <div class="text-center">
          <div class="text-32px font-bold text-green-500">{{ stats.todayTranslations.toLocaleString() }}</div>
          <div class="text-gray-500 text-12px mt-4px">今日翻译</div>
        </div>
      </NCard>
      <NCard size="small" class="flex-1 min-w-200px">
        <div class="text-center">
          <div class="text-32px font-bold text-blue-500">{{ stats.activeUsers }}</div>
          <div class="text-gray-500 text-12px mt-4px">活跃用户</div>
        </div>
      </NCard>
      <NCard size="small" class="flex-1 min-w-200px">
        <div class="text-center">
          <div class="text-32px font-bold text-orange-500">{{ stats.avgResponseTime }}</div>
          <div class="text-gray-500 text-12px mt-4px">平均响应时间</div>
        </div>
      </NCard>
    </NSpace>

    <!-- 图表区域 -->
    <NSpace :size="16" class="mb-16px" vertical>
      <NCard :bordered="false" title="翻译趋势">
        <div ref="trendChartRef" style="height: 300px"></div>
      </NCard>

      <NCard :bordered="false" title="平台分布">
        <NSpace :size="16" wrap>
          <div ref="pieChartRef" style="height: 250px; width: 300px"></div>
          <div class="flex-1">
            <div class="text-14px font-medium mb-12px">平台占比</div>
            <div
              v-for="(item, index) in pieOption.series[0].data"
              :key="index"
              class="flex items-center justify-between py-8px border-b border-gray-100 last:border-0"
            >
              <span class="text-gray-600">{{ item.name }}</span>
              <span class="font-medium">{{ item.value }}%</span>
            </div>
          </div>
        </NSpace>
      </NCard>
    </NSpace>

    <!-- 最近记录 -->
    <NCard :bordered="false" title="最近翻译记录">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50">
              <th class="px-4 py-3 text-left">用户</th>
              <th class="px-4 py-3 text-left">平台</th>
              <th class="px-4 py-3 text-left">翻译方向</th>
              <th class="px-4 py-3 text-left">响应时间</th>
              <th class="px-4 py-3 text-left">时间</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="record in recentRecords"
              :key="record.id"
              class="border-b hover:bg-gray-50"
            >
              <td class="px-4 py-3">{{ record.user }}</td>
              <td class="px-4 py-3">
                <NTag :bordered="true" :color="getPlatformTag(record.platform)" size="small" round>
                  {{ record.platform }}
                </NTag>
              </td>
              <td class="px-4 py-3">{{ record.source }} → {{ record.target }}</td>
              <td class="px-4 py-3 text-green-600">{{ record.duration }}</td>
              <td class="px-4 py-3 text-gray-500">{{ record.time }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </NCard>
  </div>
</template>

<style scoped>
</style>
