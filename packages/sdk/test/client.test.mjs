import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'

import Lacuna, { APIConnectionError, Webhooks } from '../dist/index.js'

const pendingTask = {
  id: 'task_123',
  status: 'pending',
  model: 'aether',
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  credits_used: 50,
  credits_refunded: 0,
  error: null,
  tracks: [],
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

test('generation POST is not retried after a connection failure', async () => {
  let requests = 0
  const lacuna = new Lacuna({
    apiKey: 'test_key',
    baseURL: 'https://api.example.test/api/v1',
    maxRetries: 2,
    fetch: async () => {
      requests++
      throw new TypeError('connection lost')
    },
  })

  await assert.rejects(
    lacuna.music.generations.create({
      style: 'ambient piano',
      title: 'One Request',
      instrumental: true,
    }),
    APIConnectionError
  )
  assert.equal(requests, 1)
})

test('generation POST returns the complete task contract', async () => {
  const lacuna = new Lacuna({
    apiKey: 'test_key',
    baseURL: 'https://api.example.test/api/v1',
    fetch: async () => jsonResponse(pendingTask, 202),
  })

  const task = await lacuna.music.generations.create({
    style: 'ambient piano',
    title: 'Complete Contract',
    instrumental: true,
  })

  assert.deepEqual(task, pendingTask)
})

test('GET still retries a connection failure up to maxRetries', async () => {
  let requests = 0
  const lacuna = new Lacuna({
    apiKey: 'test_key',
    baseURL: 'https://api.example.test/api/v1',
    maxRetries: 1,
    fetch: async () => {
      requests++
      if (requests === 1) throw new TypeError('connection lost')
      return jsonResponse(pendingTask)
    },
  })

  const task = await lacuna.music.generations.retrieve(pendingTask.id)
  assert.equal(task.id, pendingTask.id)
  assert.equal(requests, 2)
})

test('completed webhook tracks preserve their required index', () => {
  const timestamp = 1_753_987_200
  const secret = 'webhook_test_secret'
  const event = {
    id: 'event_123',
    type: 'job.completed',
    created: timestamp,
    data: {
      task_id: 'task_123',
      status: 'ready',
      tracks: [
        {
          id: 'track_123',
          index: 0,
          audio_url: 'https://cdn.example.test/track.mp3',
          duration: 120,
          title: 'Indexed Track',
          lyrics: null,
          image_url: null,
          tags: 'ambient',
        },
      ],
      credits_used: 50,
      created_at: '2026-08-01T00:00:00.000Z',
    },
  }
  const payload = JSON.stringify(event)
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex')

  const parsed = Webhooks.constructEvent(payload, `t=${timestamp},v1=${signature}`, secret, {
    now: () => timestamp,
  })

  assert.equal(parsed.type, 'job.completed')
  assert.equal(parsed.data.tracks[0].index, 0)
})
