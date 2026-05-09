import { buttonVariants } from "@/components/ui/button";
import {
  CalendarDays,
  CheckCircle2,
  Coins,
  MapPinned,
  Users,
} from "lucide-react";
import Link from "next/link";

const features = [
  {
    title: "Общий маршрут",
    description:
      "Собирайте единый план поездки по дням: локации, время, заметки и важные детали в одном месте.",
    icon: CalendarDays,
  },
  {
    title: "Голосования в группе",
    description:
      "Быстро принимайте решения по отелю, активностям и бюджету с прозрачными результатами для всех.",
    icon: Users,
  },
  {
    title: "Бюджет и сплиты",
    description:
      "Фиксируйте расходы в пути, делите счета автоматически и держите общий бюджет под контролем.",
    icon: Coins,
  },
];

const steps = [
  "Создайте поездку и пригласите друзей по ссылке.",
  "Добавьте точки на карте и соберите маршрут по дням.",
  "Проголосуйте за варианты и утвердите финальный план.",
];

export function HomeLanding() {
  return (
    <div className="min-h-screen">
      <main className="mx-auto flex w-full max-w-6xl flex-col px-6 pb-16 pt-10 md:px-10">
        <section className="rounded-3xl border bg-card p-8 md:p-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
            <MapPinned className="h-3.5 w-3.5 opacity-75" aria-hidden />
            Link Voyage
          </div>

          <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-[-0.035em] md:text-[2.75rem] md:leading-[1.08]">
            Планируйте путешествия с друзьями без хаоса в чатах
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground md:text-lg">
            Совместный маршрут, голосования, бюджет и карта поездки в одном
            сервисе. Все участники видят актуальный план в реальном времени.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link className={buttonVariants({ size: "lg" })} href="/auth">
              Создать поездку
            </Link>
            <Link
              className={buttonVariants({ size: "lg", variant: "outline" })}
              href="/trips"
            >
              Мои поездки
            </Link>
          </div>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="rounded-2xl border bg-card p-6 text-card-foreground transition-colors hover:border-foreground/12"
            >
              <feature.icon
                className="h-5 w-5 text-muted-foreground"
                aria-hidden
              />
              <h2 className="font-heading mt-4 text-lg font-semibold tracking-tight">
                {feature.title}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {feature.description}
              </p>
            </article>
          ))}
        </section>

        <section className="mt-8 grid gap-6 rounded-3xl border bg-card p-8 md:grid-cols-2 md:items-start">
          <div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight">
              Как это работает
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Запуск первой поездки занимает пару минут, а дальше команда живет
              в одном прозрачном рабочем пространстве.
            </p>
          </div>
          <ol className="space-y-3">
            {steps.map((step) => (
              <li key={step} className="flex items-start gap-3 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-8 rounded-3xl border bg-muted/50 px-8 py-10 md:px-12">
          <h2 className="font-heading text-2xl font-semibold tracking-tight">
            Готовы собрать первую поездку?
          </h2>
          <p className="mt-3 max-w-2xl text-sm/6 text-muted-foreground">
            Начните с базового маршрута и пригласите друзей. Добавляйте точки на
            карте, голосуйте и держите бюджет под контролем.
          </p>
          <div className="mt-6">
            <Link className={buttonVariants({ size: "lg" })} href="/auth">
              Начать
            </Link>
          </div>
        </section>

        <footer className="mt-8 text-center text-xs text-muted-foreground">
          Link Voyage · совместное планирование путешествий
        </footer>
      </main>
    </div>
  );
}
