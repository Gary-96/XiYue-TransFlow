<script setup lang="ts">
import { computed } from 'vue';

defineOptions({
  name: 'ProjectNews'
});

interface NewsItem {
  id: number;
  content: string;
  time: string;
}

const newses = computed<NewsItem[]>(() => [
  { id: 1, content: '新用户张三开通乐曼同传服务，激活卡密LM0001', time: '2026-08-14 10:23:45' },
  { id: 2, content: '抖音直播间「越南好物」开启同声传译模式', time: '2026-08-14 09:45:12' },
  { id: 3, content: '系统自动备份今日翻译数据，共 2,847 条记录', time: '2026-08-14 08:00:00' },
  { id: 4, content: '管理员更新了API密钥配置，服务运行正常', time: '2026-08-13 18:30:22' },
  { id: 5, content: '新增用户李四绑定设备：iPhone 15 Pro', time: '2026-08-13 15:20:10' }
]);
</script>

<template>
  <NCard title="项目动态" :bordered="false" size="small" segmented class="card-wrapper">
    <template #header-extra>
      <a class="text-primary" href="javascript:;">更多动态</a>
    </template>
    <NList>
      <NListItem v-for="item in newses" :key="item.id">
        <template #prefix>
          <img src="@/assets/imgs/leman.jpg" class="size-48px! rounded-full" />
        </template>
        <NThing :title="item.content" :description="item.time" />
      </NListItem>
    </NList>
  </NCard>
</template>

<style scoped></style>
