import React, { createContext, useContext, useMemo, useState } from 'react';

type Lang = 'en' | 'ru';

interface I18nContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  t: (text: string) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const STORAGE_KEY = 'fire_lang';

const RU: Record<string, string> = {
  'Dashboard': 'Дашборд',
  'Tickets': 'Тикеты',
  'Managers': 'Менеджеры',
  'Manage and track all customer support tickets': 'Управление и контроль всех обращений клиентов',
  'Filters': 'Фильтры',
  'results': 'результатов',
  'Search by ticket ID...': 'Поиск по ID тикета...',
  'All Status': 'Все статусы',
  'All Types': 'Все типы',
  'All Sentiment': 'Вся тональность',
  'Show unassigned only': 'Показывать только неназначенные',
  'Loading tickets...': 'Загрузка тикетов...',
  'No tickets found': 'Тикеты не найдены',
  'Try adjusting your filters or search query': 'Попробуйте изменить фильтры или запрос',
  'Ticket ID': 'ID тикета',
  'Created': 'Создан',
  'Showing': 'Показано',
  'of': 'из',
  'Previous': 'Назад',
  'Next': 'Вперёд',
  'Russian': 'Русский',
  'Kazakh': 'Казахский',
  'English': 'Английский',
  'Assigned Manager': 'Назначенный менеджер',
  'Failed to load tickets': 'Не удалось загрузить тикеты',
  'Loading ticket...': 'Загрузка тикета...',
  'Ticket not found': 'Тикет не найден',
  'Back to tickets': 'Назад к тикетам',
  'Please select a manager and provide a reason': 'Выберите менеджера и укажите причину',
  'Ticket reassigned successfully': 'Тикет успешно переназначен',
  'Failed to reassign ticket': 'Не удалось переназначить тикет',
  'Back': 'Назад',
  'Ticket Unassigned': 'Тикет не назначен',
  'No eligible managers available matching the required criteria.': 'Нет менеджеров, соответствующих критериям.',
  'Assignment Error': 'Ошибка назначения',
  'Failed to process this ticket. Error code:': 'Не удалось обработать тикет. Код ошибки:',
  'View Details': 'Смотреть детали',
  'Try Again': 'Повторить',
  'Assignment Reasoning': 'Логика назначения',
  'Rule Result': 'Результат правила',
  'Candidate Managers': 'Кандидаты менеджеры',
  'Assignment completed': 'Назначение выполнено',
  'Admin Actions': 'Действия администратора',
  'Manage ticket assignment and status': 'Управление назначением и статусом',
  'Export': 'Экспорт',
  'Mark Resolved': 'Отметить решённым',
  'Reassign': 'Переназначить',
  'Reassign Ticket': 'Переназначить тикет',
  'Cancel': 'Отмена',
  'Confirm Reassignment': 'Подтвердить переназначение',
  'Select a new manager for ticket': 'Выберите нового менеджера для тикета',
  'Select Manager': 'Выберите менеджера',
  'Choose a manager...': 'Выберите менеджера...',
  'Reason for Reassignment': 'Причина переназначения',
  'Explain why this ticket is being reassigned...': 'Опишите причину переназначения...',
  'The original manager will be notified of this reassignment.': 'Первоначальный менеджер будет уведомлен о переназначении.',
  'Overall ticket sentiment': 'Общая тональность тикетов',
  'Import & Processing': 'Импорт и обработка',
  'Upload CSV files and run automated ticket processing': 'Загрузите CSV и запустите автоматическую обработку тикетов',
  'Import CSVs': 'Импорт CSV',
  'Run Processing': 'Запустить обработку',
  'Select File': 'Выбрать файл',
  'Processing Pipeline': 'Пайплайн обработки',
  'Automated ticket processing workflow': 'Автоматический процесс обработки тикетов',
  'Processing Log': 'Логи обработки',
  'Real-time event stream': 'Поток событий в реальном времени',
  'Processing Summary': 'Сводка обработки',
  'Final results': 'Итоговые результаты',
  'Total Processed': 'Всего обработано',
  'Assigned Local': 'Назначено локально',
  'Assigned Cross-Office': 'Назначено межофисно',
  'Unassigned Global': 'Не назначено глобально',
  'Top Unassigned Reasons': 'Причины неназначения',
  'No data': 'Нет данных',
  'Latest Run Summary': 'Сводка последнего запуска',
  'No recent run': 'Нет последнего запуска',
  'Run in progress': 'Запуск выполняется',
  'Uploaded': 'Загружено',
  'Validated': 'Проверено',
  'Idle': 'Ожидание',
  'rows': 'строк',
  'Parsed tickets.csv:': 'Разобрано tickets.csv:',
  'Parsed managers.csv:': 'Разобрано managers.csv:',
  'Parsed business_units.csv:': 'Разобрано business_units.csv:',
  'Import completed': 'Импорт завершён',
  'Import failed': 'Импорт не выполнен',
  'Please select all three CSV files': 'Выберите все три CSV файла',
  'Uploading CSV files...': 'Загрузка CSV файлов...',
  'Starting processing pipeline...': 'Запуск пайплайна обработки...',
  'View and manage support team members': 'Просмотр и управление командой поддержки',
  'All Skills': 'Все навыки',
  'Loading managers...': 'Загрузка менеджеров...',
  'No managers found': 'Менеджеры не найдены',
  'active': 'активен',
  'Updated': 'Обновлено',
  'Current Load': 'Текущая нагрузка',
  'Team Load Distribution': 'Распределение нагрузки команды',
  'Max Capacity': 'Макс. ёмкость',
  'Current workload across all managers': 'Текущая нагрузка всех менеджеров',
  'Analytics': 'Аналитика',
  'Performance metrics and fairness insights': 'Метрики производительности и справедливости',
  'Date range': 'Период',
  'Custom Range': 'Произвольный период',
  'Export Report': 'Экспорт отчёта',
  'Load Balance Score': 'Баланс нагрузки',
  'Based on current manager workload': 'На основе текущей нагрузки',
  'Skill Utilization': 'Использование навыков',
  'Managers covering active skill needs': 'Менеджеры, покрывающие активные навыки',
  'Office Distribution': 'Распределение по офисам',
  'Astana vs Almaty split ratio': 'Соотношение Астана/Алматы',
  'Avg Response Time': 'Среднее время ответа',
  'Not tracked in current dataset': 'Не отслеживается в текущих данных',
  'Assignments by Office': 'Назначения по офисам',
  'Distribution across locations': 'Распределение по локациям',
  'Assignment Success Rate': 'Успешность назначений',
  'Daily success percentage': 'Ежедневный процент успеха',
  'Assistant': 'Ассистент',
  'Ask me about tickets, managers, or assignment rules.': 'Спросите про тикеты, менеджеров или правила назначения.',
  'Ask questions about tickets, managers, and assignment logic.': 'Задавайте вопросы о тикетах, менеджерах и логике назначения.',
  'Chat': 'Чат',
  'AI assistant for system insights': 'AI-помощник для аналитики системы',
  'Type your question...': 'Введите вопрос...',
  'Send': 'Отправить',
  'Assistant failed': 'Ассистент недоступен',
  'Sorry, I could not answer that right now.': 'Извините, сейчас не могу ответить.',
  'Chart generated.': 'График построен.',
  'Chart': 'График',
  'Generated from assistant request': 'Сгенерировано по запросу ассистента',
  'Rate limited. Try again in': 'Превышен лимит. Повторите через',
  'Rate limited. Try again later.': 'Превышен лимит. Попробуйте позже.',
  'Import': 'Импорт',
  'Search tickets, customers...': 'Поиск тикетов, клиентов...',
  'Role:': 'Роль:',
  'Admin': 'Админ',
  'Operator': 'Оператор',
  'Import CSV': 'Импорт CSV',
  'Real-time ticket processing and assignment overview': 'Обзор обработки и назначения тикетов в реальном времени',
  'Total Tickets': 'Всего тикетов',
  'Assigned': 'Назначено',
  'Unassigned': 'Не назначено',
  'Avg Priority': 'Средний приоритет',
  'Negative Sentiment': 'Негатив',
  'Last 7 days': 'Последние 7 дней',
  'success rate': 'успех',
  'Awaiting assignment': 'Ожидают назначения',
  'Out of 10': 'Из 10',
  'tickets': 'тикетов',
  'Ticket Types': 'Типы тикетов',
  'Distribution by category': 'Распределение по категориям',
  'Sentiment Distribution': 'Распределение тональности',
  'Sentiment Analysis': 'Анализ тональности',
  'Ticket assignment by location': 'Назначения по локациям',
  'Manager Workload': 'Загрузка менеджеров',
  'Current assignment distribution': 'Текущее распределение назначений',
  'Manager': 'Менеджер',
  'Office': 'Офис',
  'Skills': 'Навыки',
  'Load': 'Нагрузка',
  'Recent System Errors': 'Последние ошибки системы',
  'Latest processing issues requiring attention': 'Последние проблемы обработки',
  'View All': 'Смотреть все',
  'No recent errors.': 'Нет последних ошибок.',
  'Ticket Volume': 'Объем тикетов',
  'Last 7 days trend': 'Тренд за 7 дней',
  'Tickets list': 'Список тикетов',
  'Filter by': 'Фильтр',
  'Status': 'Статус',
  'All Statuses': 'Все статусы',
  'Error': 'Ошибка',
  'All Offices': 'Все офисы',
  'Language': 'Язык',
  'All Languages': 'Все языки',
  'Search tickets...': 'Поиск тикетов...',
  'Clear Filters': 'Сбросить фильтры',
  'Ticket Details': 'Детали тикета',
  'Original Ticket': 'Исходный тикет',
  'Customer message': 'Сообщение клиента',
  'No attachments': 'Нет вложений',
  'Customer Information': 'Информация о клиенте',
  'Profile details': 'Детали профиля',
  'Segment': 'Сегмент',
  'City': 'Город',
  'Contact': 'Контакт',
  'AI Analysis': 'AI-анализ',
  'Automated ticket enrichment': 'Автоматическое обогащение тикета',
  'Type': 'Тип',
  'Sentiment': 'Тональность',
  'Priority': 'Приоритет',
  'Summary': 'Summary',
  'Recommendation': 'Рекомендация',
  'Geo Detection': 'Гео-определение',
  'Confidence': 'Уверенность',
  'Location': 'Локация',
  'Client and office positions': 'Позиции клиента и офиса',
  'Client location derived from AI geo detection': 'Локация клиента получена из AI-геодетекции',
  'Location not detected. Fallback office routing used.': 'Локация не определена. Использован fallback офис.',
  'Open offices map': 'Открыть карту офисов',
  'Map unavailable': 'Карта недоступна',
  'Assignment': 'Назначение',
  'Manager allocation details': 'Детали назначения менеджера',
  'No manager assigned to this ticket': 'Менеджер не назначен',
  'Select manager': 'Выберите менеджера',
  'Reason for reassignment': 'Причина переназначения',
  'Submit Reassignment': 'Подтвердить переназначение',
  'All Roles': 'Все роли',
  'Filter by role': 'Фильтр по роли',
  'Filter by office': 'Фильтр по офису',
  'Filter by skill': 'Фильтр по навыку',
  'Errors': 'Ошибки',
  'Tickets Overview': 'Обзор тикетов',
  'Ticket volume, sentiment and assignment metrics': 'Объем тикетов, тональность и метрики назначения',
  'Average Assignment Time': 'Среднее время назначения',
  'Requires processing run': 'Требует запуска обработки',
  'Manager Load Over Time': 'Нагрузка менеджеров во времени',
  'Average workload percentage': 'Средний процент нагрузки',
  'Assignment Outcomes': 'Результаты назначений',
  'Assigned vs Unassigned': 'Назначено vs Не назначено',
  'Tickets by Office': 'Тикеты по офисам',
  'Ticket Status': 'Статус тикета',
  'Details': 'Детали',

};

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'ru' ? 'ru' : 'en';
  });

  const setLang = (next: Lang) => {
    setLangState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  const toggleLang = () => {
    setLang(lang === 'en' ? 'ru' : 'en');
  };

  const t = useMemo(() => {
    return (text: string) => {
      if (lang === 'ru') {
        return RU[text] || text;
      }
      return text;
    };
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, toggleLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}
