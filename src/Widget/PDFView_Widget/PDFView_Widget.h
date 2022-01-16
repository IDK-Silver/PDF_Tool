#ifndef PDFVIEW_WIDGET
#define PDFVIEW_WIDGET

#include <QWidget>

QT_BEGIN_NAMESPACE
namespace Ui
{
    class PDFView_Widget;
}
QT_END_NAMESPACE

class PDFView_Widget : public QWidget
{
    Q_OBJECT
public:
    explicit PDFView_Widget(QWidget *parent = nullptr);
    ~PDFView_Widget() override;

private:
    Ui::PDFView_Widget *ui;

private slots:
};

#endif
