<template>
  <div class="app-layout">
    <div class="sidebar-container">
      <Sidebar 
        :initial-phase="currentPhase"
        :geometric-data="currentGeoData"
        :saved-view-states="savedViewStates"
        @phase-change="handlePhaseChange"
        @module-change="handleModuleChange"
        @sub-module-change="handleSubModuleChange"
        @plane-level-change="handlePlaneLevelChange"
        @start-measure="handleStartMeasure"
        @stop-measure="handleStopMeasure"
        @undo-measurement="handleUndoMeasurement"
        @save-view-state="handleSaveViewState"
        @restore-view-state="handleRestoreViewState"
        @delete-view-state="handleDeleteViewState"
        @rename-view-state="handleRenameViewState"
        @toggle-virtual-valve="handleToggleVirtualValve"
        @update-valve-opacity="handleUpdateValveOpacity"
        @update-valve-rotation="handleUpdateValveRotation"
        @locate-plane="handleLocatePlane"
        @restore-mpr="handleRestoreMPR"
      />
    </div>
    <div class="viewer-container">
      <MainViewer 
        ref="mainViewerRef"
        :series-instance-u-i-d="seriesInstanceUID"
        :current-phase="currentPhase"
        :all-series-u-i-ds="config.seriesInstanceUIDs"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useApp } from './composables/useApp.js';
import { getAppConfig } from './config/appConfig.js';
import Sidebar from './components/Sidebar.vue';
import MainViewer from './components/MainViewer.vue';

// 从配置获取参数
const config = getAppConfig();
const studyInstanceUID = ref(config.studyInstanceUID);

// 初始化应用状态和事件处理
const {
  currentPhase,
  currentModule,
  currentSubModule,
  currentSliceIndex,
  currentGeoData,
  mainViewerRef,
  seriesInstanceUID,
  studyInstanceUID: computedStudyUID,
  handleGeoDataUpdate,
  handlePhaseChange,
  handleModuleChange,
  handleSubModuleChange,
  handlePlaneLevelChange,
  handleStartMeasure,
  handleStopMeasure,
  handleUndoMeasurement,
  handleToggleVirtualValve,
  handleUpdateValveOpacity,
  handleUpdateValveRotation,
  handleLocatePlane,
  handleRestoreMPR,
  loadAllGeometricData
} = useApp(config.seriesInstanceUIDs, studyInstanceUID);

// 视图状态管理
const savedViewStates = computed(() => {
  return mainViewerRef.value?.savedViewStates || [];
});

function handleSaveViewState(name) {
  if (mainViewerRef.value && mainViewerRef.value.saveViewState) {
    mainViewerRef.value.saveViewState(name);
  }
}

function handleRestoreViewState(stateId) {
  if (mainViewerRef.value && mainViewerRef.value.restoreViewState) {
    mainViewerRef.value.restoreViewState(stateId);
  }
}

function handleDeleteViewState(stateId) {
  if (mainViewerRef.value && mainViewerRef.value.deleteViewState) {
    mainViewerRef.value.deleteViewState(stateId);
  }
}

function handleRenameViewState(stateId, newName) {
  if (mainViewerRef.value && mainViewerRef.value.renameViewState) {
    mainViewerRef.value.renameViewState(stateId, newName);
  }
}

// 应用初始化时加载所有几何数据
onMounted(() => {
  loadAllGeometricData();
});
</script>

<style>
body {
  margin: 0;
  overflow: hidden;
  background-color: #0b1829;
  color: #e0e0e0;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.app-layout {
  display: flex;
  width: 100vw;
  height: 100vh;
}

.sidebar-container {
  width: 350px;
  flex-shrink: 0;
  height: 100%;
  box-shadow: 2px 0 10px rgba(0,0,0,0.5);
  z-index: 100;
}

.viewer-container {
  flex: 1;
  height: 100%;
  position: relative;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 8px;
}
::-webkit-scrollbar-track {
  background: #0b1829; 
}
::-webkit-scrollbar-thumb {
  background: #1c3a5e; 
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: #2c4f7a; 
}
</style>
