<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { createReusableTemplate } from '@vueuse/core';
import { useThemeStore } from '@/store/modules/theme';

defineOptions({
  name: 'CardData'
});

interface CardData {
  key: string;
  title: string;
  value: string;
  unit: string;
  color: {
    start: string;
    end: string;
  };
  icon: string;
  path: string;
}

const cardData = computed<CardData[]>(() => [
  {
    key: 'devices',
    title: '今日活跃设备',
    value: '28',
    unit: '台',
    color: {
      start: '#3b82f6',
      end: '#1d4ed8'
    },
    icon: 'carbon:desktop',
    path: '/user'
  },
  {
    key: 'token',
    title: '今日 Token 消耗',
    value: '1.28M',
    unit: '',
    color: {
      start: '#8b5cf6',
      end: '#6d28d9'
    },
    icon: 'carbon:chip',
    path: '/stats'
  },
  {
    key: 'revenue',
    title: '今日收益',
    value: '￥1,280',
    unit: '',
    color: {
      start: '#10b981',
      end: '#059669'
    },
    icon: 'carbon:currency-yuan',
    path: '/order'
  },
  {
    key: 'license',
    title: '激活码剩余',
    value: '156',
    unit: '张',
    color: {
      start: '#f59e0b',
      end: '#d97706'
    },
    icon: 'carbon:key',
    path: '/license'
  }
]);

interface GradientBgProps {
  gradientColor: string;
}

const [DefineGradientBg, GradientBg] = createReusableTemplate<GradientBgProps>();

const themeStore = useThemeStore();
const router = useRouter();

function getGradientColor(color: CardData['color']) {
  return `linear-gradient(to bottom right, ${color.start}, ${color.end})`;
}

function handleClick(path: string) {
  router.push(path);
}
</script>

<template>
  <NCard :bordered="false" size="small" class="card-wrapper">
    <!-- define component start: GradientBg -->
    <DefineGradientBg v-slot="{ $slots, gradientColor }">
      <div
        class="px-16px pb-4px pt-8px text-white cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
        :style="{ backgroundImage: gradientColor, borderRadius: themeStore.themeRadius + 'px' }"
        :data-path="''"
      >
        <component :is="$slots.default" />
      </div>
    </DefineGradientBg>
    <!-- define component end: GradientBg -->

    <NGrid cols="s:1 m:2 l:4" responsive="screen" :x-gap="16" :y-gap="16">
      <NGi v-for="item in cardData" :key="item.key">
        <div :data-path="item.path">
          <GradientBg :gradient-color="getGradientColor(item.color)" class="flex-1">
            <div @click="handleClick(item.path)">
              <h3 class="text-16px">{{ item.title }}</h3>
              <div class="flex justify-between pt-12px">
                <SvgIcon :icon="item.icon" class="text-32px" />
                <div class="text-30px text-white dark:text-dark">
                  {{ item.value }}
                  <span class="text-14px ml-4px">{{ item.unit }}</span>
                </div>
              </div>
            </div>
          </GradientBg>
        </div>
      </NGi>
    </NGrid>
  </NCard>
</template>

<style scoped>
.card-wrapper :deep(.n-card__content) {
  padding: 0;
}
</style>
