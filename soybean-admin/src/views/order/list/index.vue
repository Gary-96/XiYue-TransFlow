<script setup lang="ts">
import { h, ref } from 'vue';
import { NButton, NInput, NSelect, NSpace, NTag, NCard } from 'naive-ui';
import { useNaivePaginatedTable } from '@/hooks/common/table';
import { defaultTransform } from '@/hooks/common/table';

interface OrderRecord {
  id: number;
  orderNo: string;
  userName: string;
  licenseKey: string;
  amount: number;
  status: '1' | '2' | '3';
  createTime: string;
  payTime: string;
}

// 搜索参数
const searchParams = ref({
  keyword: '',
  status: undefined as string | undefined
});

// 状态选项
const statusOptions = [
  { label: '待支付', value: '1' },
  { label: '已支付', value: '2' },
  { label: '已取消', value: '3' }
];

// 表格列定义
const baseColumns: NaiveUI.TableColumn<OrderRecord>[] = [
  { type: 'selection', fixed: 'left' },
  { key: 'id', title: 'ID', width: 80, fixed: 'left' },
  { key: 'orderNo', title: '订单号', width: 200 },
  { key: 'userName', title: '用户', width: 120 },
  { key: 'licenseKey', title: '卡密', width: 220 },
  {
    key: 'amount',
    title: '金额',
    width: 100,
    render(row) {
      return h('span', { style: 'color: #f5222d; font-weight: bold' }, `¥${row.amount}`);
    }
  },
  {
    key: 'status',
    title: '状态',
    width: 100,
    render(row) {
      const config: Record<string, { type: 'warning' | 'success' | 'default'; label: string }> = {
        '1': { type: 'warning', label: '待支付' },
        '2': { type: 'success', label: '已支付' },
        '3': { type: 'default', label: '已取消' }
      };
      const c = config[row.status];
      return h(NTag, { type: c.type, size: 'small' }, { default: () => c.label });
    }
  },
  { key: 'createTime', title: '下单时间', width: 160 },
  { key: 'payTime', title: '支付时间', width: 160 }
];

// 表格数据
const {
  data,
  loading,
  pagination,
  getData
} = useNaivePaginatedTable<any, OrderRecord>({
  api: async () => {
    const mockData: OrderRecord[] = Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      orderNo: `ORD${Date.now()}${String(i).padStart(6, '0')}`,
      userName: `用户${i + 1}`,
      licenseKey: `LM${String(i + 1).padStart(4, '0')}-XXXX-XXXX-XXXX`,
      amount: [99, 199, 299, 499][i % 4],
      status: (['1', '2', '3'][i % 3]) as '1' | '2' | '3',
      createTime: `2024-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')} ${String(i % 24).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00`,
      payTime: i % 3 !== 0 ? `2024-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')} ${String((i + 1) % 24).padStart(2, '0')}:00:00` : ''
    }));
    
    return {
      data: {
        records: mockData,
        current: 1,
        size: 10,
        total: 50
      },
      error: false
    };
  },
  transform: defaultTransform,
  columns: () => baseColumns
});

// 金额统计
const stats = ref({
  totalAmount: 125800,
  todayAmount: 8900,
  orderCount: 1258,
  todayCount: 45
});

function handleSearch() {
  getData();
}

function handleReset() {
  searchParams.value = {
    keyword: '',
    status: undefined
  };
  getData();
}
</script>

<template>
  <div class="p-16px">
    <!-- 统计卡片 -->
    <NCard :bordered="false" class="mb-16px">
      <NSpace :size="16" wrap>
        <NCard size="small" class="w-200px">
          <div class="text-center">
            <div class="text-28px font-bold text-red-500">¥{{ (stats.totalAmount / 100).toFixed(2) }}</div>
            <div class="text-gray-500 text-12px mt-4px">总成交额</div>
          </div>
        </NCard>
        <NCard size="small" class="w-200px">
          <div class="text-center">
            <div class="text-28px font-bold text-green-500">¥{{ (stats.todayAmount / 100).toFixed(2) }}</div>
            <div class="text-gray-500 text-12px mt-4px">今日成交</div>
          </div>
        </NCard>
        <NCard size="small" class="w-200px">
          <div class="text-center">
            <div class="text-28px font-bold">{{ stats.orderCount }}</div>
            <div class="text-gray-500 text-12px mt-4px">订单总数</div>
          </div>
        </NCard>
        <NCard size="small" class="w-200px">
          <div class="text-center">
            <div class="text-28px font-bold text-blue-500">{{ stats.todayCount }}</div>
            <div class="text-gray-500 text-12px mt-4px">今日订单</div>
          </div>
        </NCard>
      </NSpace>
    </NCard>

    <!-- 搜索栏 -->
    <NCard :bordered="false" class="mb-16px">
      <NSpace :size="12" wrap>
        <NInput
          v-model:value="searchParams.keyword"
          placeholder="搜索订单号/用户名"
          clearable
          style="width: 200px"
        />
        <NSelect
          v-model:value="searchParams.status"
          placeholder="订单状态"
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
      <NDataTable
        :columns="baseColumns"
        :data="data"
        :loading="loading"
        :pagination="pagination"
        :scroll-x="1200"
        remote
        :row-key="(row: OrderRecord) => row.id"
        @update:page="pagination.onUpdatePage"
        @update:page-size="pagination.onUpdatePageSize"
      />
    </NCard>
  </div>
</template>

<style scoped>
</style>
