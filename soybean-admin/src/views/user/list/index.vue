<script setup lang="ts">
import { h, ref } from 'vue';
import { NButton, NInput, NSelect, NSpace, NTag } from 'naive-ui';
import { useNaivePaginatedTable } from '@/hooks/common/table';
import { defaultTransform } from '@/hooks/common/table';

interface UserRecord {
  id: number;
  userName: string;
  phone: string;
  email: string;
  status: '1' | '2';
  createTime: string;
  licenseCount: number;
}

const message = window.$message;

// 搜索表单
const searchParams = ref({
  keyword: '',
  status: undefined as string | undefined
});

// 状态选项
const statusOptions = [
  { label: '启用', value: '1' },
  { label: '禁用', value: '2' }
];

// 表格列定义
const baseColumns: NaiveUI.TableColumn<UserRecord>[] = [
  { type: 'selection', fixed: 'left' },
  { key: 'id', title: 'ID', width: 80, fixed: 'left' },
  { key: 'userName', title: '用户名', width: 150 },
  { key: 'phone', title: '手机号', width: 150 },
  { key: 'email', title: '邮箱', width: 200 },
  { key: 'licenseCount', title: '卡密数量', width: 120 },
  {
    key: 'status',
    title: '状态',
    width: 100,
    render(row) {
      return h(NTag, {
        type: row.status === '1' ? 'success' : 'error',
        size: 'small'
      }, { default: () => row.status === '1' ? '启用' : '禁用' });
    }
  },
  { key: 'createTime', title: '创建时间', width: 180 },
  {
    key: 'actions',
    title: '操作',
    width: 150,
    render(row) {
      return h(NSpace, {}, {
        default: () => [
          h(NButton, {
            size: 'small',
            type: row.status === '1' ? 'warning' : 'success',
            ghost: true,
            onClick: () => handleToggleStatus(row)
          }, { default: () => row.status === '1' ? '禁用' : '启用' }),
          h(NButton, {
            size: 'small',
            type: 'error',
            ghost: true,
            onClick: () => handleDelete(row)
          }, { default: () => '删除' })
        ]
      });
    }
  }
];

// 表格数据
const {
  data,
  loading,
  pagination,
  getData
} = useNaivePaginatedTable<any, UserRecord>({
  api: async () => {
    const mockData: UserRecord[] = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      userName: `用户${i + 1}`,
      phone: `138${String(i).padStart(8, '0')}`,
      email: `user${i + 1}@example.com`,
      status: (i % 5 === 0 ? '2' : '1') as '1' | '2',
      createTime: `2024-01-${String((i % 28) + 1).padStart(2, '0')} 10:00:00`,
      licenseCount: Math.floor(Math.random() * 10) + 1
    }));
    
    return {
      data: {
        records: mockData,
        current: 1,
        size: 10,
        total: 25
      },
      error: false
    };
  },
  transform: defaultTransform,
  columns: () => baseColumns
});

async function handleSearch() {
  await getData();
}

async function handleReset() {
  searchParams.value = {
    keyword: '',
    status: undefined
  };
  await getData();
}

async function handleToggleStatus(row: UserRecord) {
  const newStatus = row.status === '1' ? '2' : '1';
  message?.success(`已${newStatus === '1' ? '启用' : '禁用'}用户 ${row.userName}`);
  await getData();
}

async function handleDelete(row: UserRecord) {
  message?.warning(`已删除用户 ${row.userName}`);
  await getData();
}
</script>

<template>
  <div class="p-16px">
    <!-- 搜索栏 -->
    <NCard :bordered="false" class="mb-16px">
      <NSpace :size="12" wrap>
        <NInput
          v-model:value="searchParams.keyword"
          placeholder="搜索用户名/手机号"
          clearable
          style="width: 200px"
        />
        <NSelect
          v-model:value="searchParams.status"
          placeholder="全部状态"
          :options="statusOptions"
          clearable
          style="width: 120px"
        />
        <NButton type="primary" @click="handleSearch">搜索</NButton>
        <NButton @click="handleReset">重置</NButton>
      </NSpace>
    </NCard>

    <!-- 数据表格 -->
    <NCard :bordered="false">
      <NSpace class="mb-16px">
        <NButton type="primary" @click="getData">刷新</NButton>
      </NSpace>
      
      <NDataTable
        :columns="baseColumns"
        :data="data"
        :loading="loading"
        :pagination="pagination"
        :scroll-x="1200"
        remote
        :row-key="(row: UserRecord) => row.id"
        @update:page="pagination.onUpdatePage"
        @update:page-size="pagination.onUpdatePageSize"
      />
    </NCard>
  </div>
</template>

<style scoped>
</style>
