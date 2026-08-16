<script setup lang="ts">
import { h, ref } from 'vue';
import { NButton, NTag, NSpace, NModal, NForm, NFormItem, NInputNumber, useMessage } from 'naive-ui';
import { useNaivePaginatedTable } from '@/hooks/common/table';
import { defaultTransform } from '@/hooks/common/table';

interface LicenseRecord {
  id: number;
  licenseKey: string;
  userName: string;
  status: '1' | '2' | '3';
  expireTime: string;
  createTime: string;
  usedCount: number;
}

const message = useMessage();
const modalVisible = ref(false);
const generateForm = ref({
  count: 1,
  expireDays: 365,
  prefix: 'LM'
});

// 生成卡密
function handleGenerate() {
  modalVisible.value = true;
}

function generateKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let key = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) key += '-';
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

async function confirmGenerate() {
  const keys = Array.from({ length: generateForm.value.count }, () => generateKey());
  message.success(`成功生成 ${keys.length} 个卡密`);
  console.log('生成的卡密:', keys);
  modalVisible.value = false;
  await getData();
}

function getStatusTag(status: '1' | '2' | '3') {
  const config: Record<string, { type: 'success' | 'warning' | 'error'; label: string }> = {
    '1': { type: 'success', label: '未使用' },
    '2': { type: 'warning', label: '已激活' },
    '3': { type: 'error', label: '已过期' }
  };
  return config[status] || config['1'];
}

// 表格列定义
const baseColumns: NaiveUI.TableColumn<LicenseRecord>[] = [
  { type: 'selection', fixed: 'left' },
  { key: 'id', title: 'ID', width: 80, fixed: 'left' },
  { key: 'licenseKey', title: '卡密', width: 220 },
  { key: 'userName', title: '绑定用户', width: 120 },
  {
    key: 'status',
    title: '状态',
    width: 100,
    render(row) {
      const config = getStatusTag(row.status);
      return h(NTag, { type: config.type, size: 'small' }, { default: () => config.label });
    }
  },
  { key: 'usedCount', title: '使用次数', width: 100 },
  { key: 'expireTime', title: '过期时间', width: 120 },
  { key: 'createTime', title: '创建时间', width: 150 }
];

// 表格数据
const {
  data,
  loading,
  pagination,
  getData
} = useNaivePaginatedTable<any, LicenseRecord>({
  api: async () => {
    const mockData: LicenseRecord[] = Array.from({ length: 30 }, (_, i) => ({
      id: i + 1,
      licenseKey: `LM${String(i + 1).padStart(4, '0')}-XXXX-XXXX-XXXX`,
      userName: i < 20 ? `用户${i + 1}` : '',
      status: (i % 10 === 0 ? '3' : i % 5 === 0 ? '2' : '1') as '1' | '2' | '3',
      expireTime: `2025-12-${String((i % 28) + 1).padStart(2, '0')}`,
      createTime: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
      usedCount: i % 3 === 0 ? Math.floor(Math.random() * 10) : 0
    }));
    
    return {
      data: {
        records: mockData,
        current: 1,
        size: 10,
        total: 30
      },
      error: false
    };
  },
  transform: defaultTransform,
  columns: () => baseColumns
});
</script>

<template>
  <div class="p-16px">
    <!-- 操作按钮 -->
    <NCard :bordered="false" class="mb-16px">
      <NSpace>
        <NButton type="primary" @click="handleGenerate">
          生成卡密
        </NButton>
        <NButton @click="getData">
          刷新
        </NButton>
      </NSpace>
    </NCard>

    <!-- 数据表格 -->
    <NCard :bordered="false">
      <NDataTable
        :columns="baseColumns"
        :data="data"
        :loading="loading"
        :pagination="pagination"
        :scroll-x="1000"
        remote
        :row-key="(row: LicenseRecord) => row.id"
        @update:page="pagination.onUpdatePage"
        @update:page-size="pagination.onUpdatePageSize"
      />
    </NCard>

    <!-- 生成卡密弹窗 -->
    <NModal v-model:show="modalVisible" preset="card" title="生成卡密" style="width: 400px">
      <NForm :model="generateForm" label-placement="left" label-width="80">
        <NFormItem label="生成数量">
          <NInputNumber v-model:value="generateForm.count" :min="1" :max="100" />
        </NFormItem>
        <NFormItem label="有效期">
          <NInputNumber v-model:value="generateForm.expireDays" :min="1" :max="3650" suffix="天" />
        </NFormItem>
        <NFormItem label="前缀">
          <NInput v-model:value="generateForm.prefix" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="modalVisible = false">取消</NButton>
          <NButton type="primary" @click="confirmGenerate">确认生成</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
</style>
