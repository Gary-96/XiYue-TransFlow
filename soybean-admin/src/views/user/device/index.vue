<script setup lang="ts">
import { ref } from 'vue';
import { NButton, NSpace, NTag, NCard } from 'naive-ui';

interface DeviceRecord {
  id: number;
  deviceCode: string;
  deviceName: string;
  agent: string;
  activateTime: string;
  expireTime: string;
  status: 'online' | 'offline' | 'expired';
}

const tableData = ref<DeviceRecord[]>([
  { id: 1, deviceCode: 'mac-8f3a2b', deviceName: '主播-A的电脑', agent: '代理商张三', activateTime: '2026-08-01', expireTime: '2026-09-01', status: 'online' },
  { id: 2, deviceCode: 'mac-1c9d4e', deviceName: '主播-B的笔记本', agent: '代理商李四', activateTime: '2026-07-15', expireTime: '2026-08-15', status: 'offline' },
  { id: 3, deviceCode: 'mac-5a7b2f', deviceName: '主播-C的平板', agent: '代理商张三', activateTime: '2026-06-01', expireTime: '2026-06-01', status: 'expired' }
]);

function getStatusType(status: DeviceRecord['status']) {
  const map = {
    online: 'success' as const,
    offline: 'default' as const,
    expired: 'error' as const
  };
  return map[status];
}

function getStatusLabel(status: DeviceRecord['status']) {
  const map = {
    online: '在线' as const,
    offline: '离线' as const,
    expired: '已过期' as const
  };
  return map[status];
}
</script>

<template>
  <NCard :bordered="false" title="终端设备列表" class="card-wrapper">
    <template #header-extra>
      <NSpace>
        <NButton size="small" type="primary">刷新</NButton>
      </NSpace>
    </template>
    <div class="mt-16px">
      <div v-for="item in tableData" :key="item.id" class="flex items-center justify-between py-12px px-16px bg-gray-50 rounded-lg mb-8px">
        <div>
          <div class="font-medium">{{ item.deviceName }}</div>
          <div class="text-xs text-gray-500">设备码: {{ item.deviceCode }}</div>
        </div>
        <NSpace :size="8">
          <NTag size="small" type="info">{{ item.agent }}</NTag>
          <NTag :type="getStatusType(item.status)" size="small">
            {{ getStatusLabel(item.status) }}
          </NTag>
        </NSpace>
      </div>
    </div>
  </NCard>
</template>
