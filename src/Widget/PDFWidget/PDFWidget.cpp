//
// Created by a2882 on 2021/7/19.
//

// You may need to build the project (run Qt uic code generator) to get "ui_PDFWidget.h" resolved

#include "PDFWidget.h"
#include "ui_PDFWidget.h"


PDFWidget::PDFWidget(QWidget *parent) :
        QWidget(parent), ui(new Ui::PDFWidget) {
    ui->setupUi(this);
}

PDFWidget::~PDFWidget() {
    delete ui;
}
