<script setup lang="ts">
import { ref } from 'vue';
import { NButton, NSpace, NTag, NCard, NInput, NModal, NForm, NFormItem, NInputNumber } from 'naive-ui';

interface Agent {
  id: number;
  name: string;
  code: string;
  commission: number;
  quota: number;
  usedQuota: number;
  status: 'active' | 'disabled';
}

const agents = ref<Agent[]>([
  { id: 1, name: '代理商张三', code: 'AGT001', commission: 15, quota: 100, usedQuota: 68, status: 'active' },
  { id: 2, name: '代理商李四', code: 'AGT002', commission: 12, quota: 50, usedQuota: 23, status: 'active' },
  { id: 3, name: '代理商王五', code: 'AGT003', commission: 10, quota: 200, usedQuota: 156, status: 'disabled' }
]);

const showModal = ref(false);
const form = ref({ name: '', commission: 10, quota: 50 });

function handleCreate() {
  showModal.value = true;
}

function handleSubmit() {
  showModal.value = false;
}
</script>

<template>
  <NCard :bordered="false" title="代理商管理" class="card-wrapper">
    <template #header-extra>
      <NSpace>
        <NButton size="small" type="primary" @click="handleCreate">新增代理商</NButton>
      </NSpace>
    </template>
    <table class="w-full text-sm mt-16px">
      <thead>
        <tr class="bg-gray-50">
          <th class="px-4 py-3 text-left">代理商名称</th>
          <th class="px-4 py-3 text-left">代理编码</th>
          <th class="px-4 py-3 text-left">佣金比例</th>
          <th class="px-4 py-3 text-left">卡密额度</th>
          <th class="px-4 py-3 text-left">已用额度</th>
          <th class="px-4 py-3 text-left">状态</th>
          <th class="px-4 py-3 text-left">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="agent in agents" :key="agent.id" class="border-b hover:bg-gray-50">
          <td class="px-4 py-3">{{ agent.name }}</td>
          <td class="px-4 py-3"><NTag size="small">{{ agent.code }}</NTag></td>
          <td class="px-4 py-3">{{ agent.commission }}%</td>
          <td class="px-4 py-3">{{ agent.quota }} 张</td>
          <td class="px-4 py-3">
            <div class="w-24 h-2 bg-gray-200 rounded-full">
              <div class="h-full bg-blue-500 rounded-full" :style="{ width: `${(agent.usedQuota / agent.quota) * 100}%` }"></div>
            </div>
          </td>
          <td class="px-4 py-3">
            <NTag :type="agent.status === 'active' ? 'success' : 'default'" size="small">
              {{ agent.status === 'active' ? '正常' : '禁用' }}
            </NTag>
          </td>
          <td class="px-4 py-3">
            <NSpace :size="4">
              <NButton size="small" type="primary" quaternary>编辑</NButton>
              <NButton size="small" type="error" quaternary>删除</NButton>
            </NSpace>
          </td>
        </tr>
      </tbody>
    </table>

    <NModal v-model:show="showModal" preset="card" title="新增代理商" style="width: 500px">
      <NForm :model="form" label-width="80px">
        <NFormItem label="代理商名称">
          <NInput v-model:value="form.name" placeholder="请输入代理商名称" />
        </NFormItem>
        <NFormItem label="佣金比例">
          <NInputNumber v-model:value="form.commission" :min="0" :max="50" suffix="%" />
        </NFormItem>
        <NFormItem label="卡密额度">
          <NInputNumber v-model:value="form.quota" :min="0" suffix="张" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showModal = false">取消</NButton>
          <NButton type="primary" @click="handleSubmit">确定</NButton>
        </NSpace>
      </template>
    </NModal>
  </NCard>
</template>
