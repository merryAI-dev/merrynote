import { Kafka, Producer } from 'kafkajs'

let producer: Producer | null = null

const KAFKA_BOOTSTRAP = process.env.KAFKA_BOOTSTRAP || 'localhost:9092'

export async function getKafkaProducer(): Promise<Producer> {
  if (producer) return producer

  const kafka = new Kafka({
    clientId: 'merrynote-web',
    brokers: [KAFKA_BOOTSTRAP],
    retry: { retries: 3 },
  })

  producer = kafka.producer()
  await producer.connect()
  return producer
}

export async function publishMessage(topic: string, key: string, value: object) {
  const p = await getKafkaProducer()
  await p.send({
    topic,
    messages: [{ key, value: JSON.stringify(value) }],
  })
}
