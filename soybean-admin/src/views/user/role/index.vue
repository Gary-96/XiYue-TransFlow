<script setup lang="ts">
import { ref } from 'vue';
import { NButton, NSpace, NTag, NCard, NModal, NForm, NFormItem, NTransfer, useMessage } from 'naive-ui';

interface Role {
  id: number;
  name: string;
  code: string;
  description: string;
  permissions: string[];
}

const message = useMessage();

const roles = ref<Role[]>([
  {
    id: 1,
    name: '超级管理员',
    code: 'super',
    description: '拥有所有权限，可管理代理商、角色和所有数据',
    permissions: ['user:manage', 'license:manage', 'order:manage', 'stats:view', 'agent:manage', 'role:manage']
  },
  {
    id: 2,
    name: '代理商',
    code: 'agent',
    description: '可管理自己推广的设备，查看自己的业绩数据',
    permissions: ['device:view', 'stats:own', 'license:use']
  }
]);

const showModal = ref(false);
const form = ref({ name: '', code: '', description: '' });
const permissions = ref<string[]>([]);
const allPermissions = ['user:manage', 'license:manage', 'order:manage', 'stats:view', 'agent:manage', 'role:manage', 'device:view', 'stats:own', 'license:use'];

function handleCreate() {
  showModal.value = true;
}

function handleSubmit() {
  message.success('角色创建成功');
  showModal.value = false;
}

function togglePermission(per: string) {
  const idx = permissions.value.indexOf(per);
  if (idx > -1) {
    permissions.value.splice(idx, 1);
  } else {
    permissions.value.push(per);
  }
}
</script>

<template>
  <NCard :bordered="false" title="角色管理" class="card-wrapper">
    <template #header-extra>
      <NSpace>
        <NButton size="small" type="primary" @click="handleCreate">新增角色</NButton>
      </NSpace>
    </template>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-16px">
      <NCard v-for="role in roles" :key="role.id" :bordered="false" class="shadow-sm">
        <div class="flex items-start justify-between mb-12px">
          <div>
            <h3 class="font-bold text-base">{{ role.name }}</h3>
            <NTag size="small" type="info">{{ role.code }}</NTag>
          </div>
          <NSpace :size="4">
            <NButton size="small" type="primary" quaternary>编辑</NButton>
            <NButton size="small" type="error" quaternary>删除</NButton>
          </NSpace>
        </div>
        <p class="text-sm text-gray-500 mb-12px">{{ role.description }}</p>
        <div class="flex flex-wrap gap-2">
          <NTag v-for="per in role.permissions" :key="per" size="small" type="default">{{ per }}</NTag>
        </div>
      </NCard>
    </div>

    <NModal v-model:show="showModal" preset="card" title="新增角色" style="width: 600px">
      <NForm :model="form" label-width="80px">
        <NFormItem label="角色名称">
          <NInput v-model:value="form.name" placeholder="请输入角色名称" />
        </NFormItem>
        <NFormItem label="角色编码">
          <NInput v-model:value="form.code" placeholder="请输入角色编码" />
        </NFormItem>
        <NFormItem label="描述">
          <NInput v-model:value="form.description" type="textarea" :rows="3" placeholder="请输入角色描述" />
        </NFormItem>
        <NFormItem label="权限配置">
          <div class="flex flex-wrap gap-2">
            <NTag
              v-for="per in allPermissions"
              :key="per"
              :type="permissions.includes(per) ? 'primary' : 'default'"
              class="cursor-pointer select-none"
              @click="togglePermission(per)"
            >
              {{ per }}
            </NTag>
          </div>
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
