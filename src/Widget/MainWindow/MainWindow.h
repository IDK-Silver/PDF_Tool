//
// Created by a2882 on 2021/7/19.
//

#ifndef PDF_TOOL_MAINWINDOW_H
#define PDF_TOOL_MAINWINDOW_H

#include <QMainWindow>
#include "src/Widget/PDFWidget/PDFWidget.h"
#include <QString>

QT_BEGIN_NAMESPACE
namespace Ui { class MainWindow; }
QT_END_NAMESPACE

class MainWindow : public QMainWindow {
Q_OBJECT

public:
    explicit MainWindow(QWidget *parent = nullptr);

    ~MainWindow() override;

private:
    Ui::MainWindow *ui;
    PDFWidget *pdfWidget = new PDFWidget();
};


#endif //PDF_TOOL_MAINWINDOW_H
