{{- define "modelvend.labels" -}}
app.kubernetes.io/part-of: modelvend
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}

{{/* The image reference: repository@digest when CI has pinned one, otherwise repository:tag. */}}
{{- define "modelvend.image" -}}
{{- if .digest -}}
{{ .repository }}@{{ .digest }}
{{- else -}}
{{ .repository }}:{{ .tag }}
{{- end -}}
{{- end }}

{{- define "modelvend.postgresName" -}}
{{ .Release.Name }}-postgres
{{- end }}

{{/* Settings every Go process reads. */}}
{{- define "modelvend.goEnv" -}}
- name: APP_ENV
  value: {{ .Values.appEnv | quote }}
- name: LOG_LEVEL
  value: {{ .Values.logLevel | quote }}
- name: LOG_FORMAT
  value: json
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      {{- if .Values.postgres.enabled }}
      name: {{ include "modelvend.postgresName" . }}-app
      key: uri
      {{- else }}
      name: {{ .Values.secretName }}
      key: DATABASE_URL
      {{- end }}
{{- if .Values.redis.enabled }}
- name: REDIS_URL
  value: redis://{{ .Release.Name }}-redis:6379/0
{{- end }}
{{- with .Values.publicApiUrl }}
- name: PUBLIC_API_URL
  value: {{ . | quote }}
{{- end }}
{{- with .Values.internalWorkspaces }}
- name: INTERNAL_WORKSPACES
  value: {{ . | quote }}
{{- end }}
{{- if .Values.storage.endpoint }}
- name: STORAGE_ENDPOINT
  value: {{ .Values.storage.endpoint | quote }}
- name: STORAGE_BUCKET
  value: {{ .Values.storage.bucket | quote }}
- name: STORAGE_REGION
  value: {{ .Values.storage.region | quote }}
- name: STORAGE_USE_SSL
  value: {{ .Values.storage.useSSL | quote }}
- name: STORAGE_PUBLIC_URL
  value: {{ .Values.storage.publicUrl | quote }}
- name: STORAGE_ACCESS_KEY
  valueFrom:
    secretKeyRef:
      name: {{ .Values.secretName }}
      key: STORAGE_ACCESS_KEY
- name: STORAGE_SECRET_KEY
  valueFrom:
    secretKeyRef:
      name: {{ .Values.secretName }}
      key: STORAGE_SECRET_KEY
{{- end }}
{{- end }}

{{- define "modelvend.podSecurity" -}}
runAsNonRoot: true
seccompProfile:
  type: RuntimeDefault
{{- end }}

{{- define "modelvend.containerSecurity" -}}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities:
  drop: [ALL]
{{- end }}
